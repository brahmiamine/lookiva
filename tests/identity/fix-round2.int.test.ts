import { afterAll, describe, expect, it } from 'vitest';
import { newId } from '@/platform/http/ids';
import { closeAll, db, harness } from './harness';

afterAll(closeAll);

const A = 'attacker chosen phrase';
const V = 'victim own passphrase';

describe('N1: resend keeps the pending password of the latest registration', () => {
  it('attacker_resend_after_victim_registration_does_not_restore_the_attacker_password', async () => {
    const attacker = harness();
    const victim = harness();
    const email = attacker.newEmail('victim');
    await attacker.api.register({ email, password: A });
    await victim.api.register({ email, password: V });
    attacker.clock.advance(5 * 60_000); // well past the cooldown, whatever the two harness clocks differ by
    expect((await attacker.api.resend(email)).status).toBe(202); // voids the victim's link, mails a new one
    expect(await victim.outbox(email)).toHaveLength(3);
    expect((await victim.api.verify(await victim.lastToken(email))).status).toBe(200);
    expect((await victim.api.login(email, V)).status).toBe(200);
    expect((await attacker.api.login(email, A)).body).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
  });
});

describe('N2: a stale verification link never overwrites a password', () => {
  it('victim_reset_before_clicking_the_attacker_link_keeps_the_reset_password', async () => {
    const attacker = harness();
    const victim = harness();
    const email = attacker.newEmail('victim');
    await attacker.api.register({ email, password: A });
    const staleLink = await victim.lastToken(email); // the attacker's registration mail, sitting in the victim's mailbox
    await victim.api.forgot(email);
    expect((await victim.api.reset(await victim.lastToken(email), V)).status).toBe(200);
    expect((await victim.api.verify(staleLink)).body).toMatchObject({ code: 'INVALID_TOKEN' });
    expect((await victim.api.login(email, V)).status).toBe(200);
    expect((await attacker.api.login(email, A)).status).toBe(401);
  });

  it('legit_user_who_reset_before_verifying_is_not_reverted_by_the_old_mail', async () => {
    const h = harness();
    const email = h.newEmail();
    await h.api.register({ email, password: 'first forgotten phrase' });
    const oldMail = await h.lastToken(email);
    await h.api.forgot(email);
    await h.api.reset(await h.lastToken(email), 'second chosen phrase');
    await h.api.verify(oldMail);
    expect((await h.api.login(email, 'second chosen phrase')).status).toBe(200);
    expect((await h.api.login(email, 'first forgotten phrase')).status).toBe(401);
  });

  it('pending_hash_is_ignored_when_the_account_is_already_verified', async () => {
    const h = harness();
    const { email, userId } = await h.signedIn();
    const before = (await db.credential.findUniqueOrThrow({ where: { userId } })).passwordHash;
    // a live verify token with a pending hash that somehow survived (defence in depth for the store guard)
    const { sessionTokens } = await import('@/modules/identity/infrastructure/crypto');
    const { token, hash } = sessionTokens.generate();
    const now = h.clock.now();
    await db.emailToken.create({
      data: { id: newId(), userId, purpose: 'VERIFY_EMAIL', tokenHash: hash, createdAt: now, expiresAt: new Date(now.getTime() + 3_600_000), pendingPasswordHash: 'scrypt$32768$8$1$AAAA$BBBB' },
    });
    expect((await h.api.verify(token)).status).toBe(200);
    expect((await db.credential.findUniqueOrThrow({ where: { userId } })).passwordHash).toBe(before);
    expect((await h.api.login(email, 'violet sunset harbour')).status).toBe(200);
  });
});

describe('N4: pending hashes do not linger', () => {
  it('voided_and_consumed_tokens_carry_no_pending_hash', async () => {
    const h = harness();
    const email = h.newEmail();
    await h.api.register({ email, password: A });
    await h.api.register({ email, password: V }); // voids the first link
    await h.api.verify(await h.lastToken(email)); // consumes the second
    const user = await db.user.findUniqueOrThrow({ where: { emailNormalized: email } });
    const tokens = await db.emailToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(2);
    for (const t of tokens) expect(t.pendingPasswordHash).toBeNull();
  });

  it('purge_deletes_used_or_expired_tokens_older_than_the_cutoff_only', async () => {
    const { purgeEmailTokens } = await import('@/modules/identity');
    const h = harness();
    const { userId } = await h.signedIn();
    const old = new Date('2020-01-01T00:00:00Z');
    const mk = (tag: string, data: { usedAt?: Date; expiresAt: Date; createdAt: Date }) =>
      db.emailToken.create({ data: { id: newId(), userId, purpose: 'RESET_PASSWORD', tokenHash: `${tag}${newId()}`.replace(/-/g, '').padEnd(64, '0').slice(0, 64), ...data } });
    const future = new Date(Date.now() + 86_400_000);
    const oldUsed = await mk('a', { usedAt: old, expiresAt: future, createdAt: old });
    const oldExpired = await mk('b', { expiresAt: old, createdAt: old });
    const oldLive = await mk('c', { expiresAt: future, createdAt: old }); // never deleted while usable
    const recentUsed = await mk('d', { usedAt: new Date(), expiresAt: future, createdAt: new Date() });
    const cutoff = new Date(Date.now() - 7 * 86_400_000);
    expect(await purgeEmailTokens(db, cutoff, new Date())).toBeGreaterThanOrEqual(2);
    const left = new Set((await db.emailToken.findMany({ where: { userId } })).map((t) => t.id));
    expect(left.has(oldUsed.id)).toBe(false);
    expect(left.has(oldExpired.id)).toBe(false);
    expect(left.has(oldLive.id)).toBe(true);
    expect(left.has(recentUsed.id)).toBe(true);
  });
});

describe('N5: per-email registration limit', () => {
  it('six_registrations_of_one_email_from_six_addresses_hit_429', async () => {
    const h = harness();
    const email = h.newEmail('target');
    const from = (i: number) =>
      h.send(h.http.register, h.request('/auth/register', { body: { email, password: A }, headers: { ...h.idem(), 'x-forwarded-for': `198.51.100.${i}` } }));
    for (let i = 0; i < 5; i++) expect((await from(i)).status).toBe(202);
    const res = await from(99);
    expect([res.status, res.body?.code]).toEqual([429, 'RATE_LIMITED']);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await from(100).then(() => h.api.register({ email: h.newEmail(), password: A }))).status).toBe(202);
  });
});

describe('N8: login holds the credential lock while a reset runs', () => {
  it('reset_waiting_on_the_login_lock_revokes_the_new_session_without_deadlock', async () => {
    let reset: Promise<{ status: number }> | undefined;
    let fire: (() => void) | undefined;
    const h = harness({
      hooks: {
        whileCredentialLocked: async () => {
          fire?.();
          await new Promise((r) => setTimeout(r, 800)); // the reset scrypts, then blocks on our row lock
        },
      },
    });
    const { email, userId } = await h.signedIn(); // hook not armed yet (fire undefined) but still sleeps: fine
    await h.api.forgot(email);
    const token = await h.lastToken(email);
    fire = () => {
      fire = undefined;
      reset = h.api.reset(token, 'the brand new passphrase');
    };
    const login = await h.api.login(email, 'violet sunset harbour');
    const r = await reset;
    expect(r?.status).toBe(200); // no deadlock / 500
    expect([200, 401]).toContain(login.status);
    expect(await db.sessionRegistry.count({ where: { userId, revokedAt: null } })).toBe(0);
    if (login.status === 200) expect((await h.api.me(h.cookieOf(login.headers))).status).toBe(401);
    expect((await h.api.login(email, 'the brand new passphrase')).status).toBe(200);
  });
});
