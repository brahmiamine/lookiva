import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { FakeAudit, FakeClock } from '@/platform';
import { OutboxEmail } from '@/platform/email/outbox';
import { createIdentityHttp } from '@/modules/identity';
import { closeAll, db, harness, redis } from './harness';

afterAll(closeAll);

describe('email links never trust the request host (I1)', () => {
  it('forged_host_and_forwarded_proto_do_not_reach_the_mailed_link', async () => {
    const h = harness(); // APP_ORIGIN = http://localhost:3000
    const { email } = await h.signedIn();
    const forged = new Request('http://evil.example/api/v1/auth/password/forgot', {
      method: 'POST',
      headers: {
        host: 'evil.example',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'evil.example',
        'x-requested-with': 'lookiva',
        'content-type': 'application/json',
        'x-forwarded-for': h.ip,
        ...h.idem(),
      },
      body: JSON.stringify({ email }),
    });
    expect((await h.send(h.http.forgotPassword, forged)).status).toBe(202);
    const text = (await h.outbox(email)).at(-1)?.text ?? '';
    expect(text).toContain('http://localhost:3000/fr/reset-password#token=');
    expect(text).not.toContain('evil.example');
  });

  it('identity_with_a_mailer_refuses_to_build_without_app_origin', () => {
    const clock = new FakeClock();
    const build = () =>
      createIdentityHttp({
        db,
        redis,
        clock,
        audit: new FakeAudit(),
        email: new OutboxEmail(db, clock),
        config: { production: false, trustProxy: true },
        rateLimitPrefix: `rl-${randomUUID()}`,
      });
    expect(build).toThrow(/APP_ORIGIN/);
  });
});

describe('input bounds', () => {
  it('oversized_body_is_413_PAYLOAD_TOO_LARGE', async () => {
    const h = harness();
    const res = await h.api.login(h.newEmail(), 'x'.repeat(20_000));
    expect(res.body).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
    expect(res.text).not.toContain('xxxxxxxxxx');
  });

  it('login_ip_limit_is_enforced_before_the_body_is_read', async () => {
    const h = harness();
    for (let i = 0; i < 30; i++) await h.api.login(h.newEmail(), 'wrong password x');
    const malformed = h.request('/auth/login', { body: 'ignored', headers: { 'content-type': 'application/json' } });
    const raw = new Request(malformed, { body: '{not json', method: 'POST', duplex: 'half' } as RequestInit);
    const res = await h.send(h.http.login, raw);
    expect([res.status, res.body?.code]).toEqual([429, 'RATE_LIMITED']);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('pre-registration hijack (I2)', () => {
  it('attacker_first_victim_second_victim_password_wins_after_verification', async () => {
    const attacker = harness();
    const victim = harness();
    const email = attacker.newEmail('victim');
    await attacker.api.register({ email, password: 'attacker chosen phrase' });
    await victim.api.register({ email, password: 'victim own passphrase' }); // immediately, inside the resend cooldown
    // the victim opens the newest mail in their mailbox
    expect((await victim.api.verify(await victim.lastToken(email))).status).toBe(200);
    expect((await victim.api.login(email, 'victim own passphrase')).status).toBe(200);
    expect((await attacker.api.login(email, 'attacker chosen phrase')).body).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('pending_password_hash_is_stored_on_the_verify_token_only_as_scrypt', async () => {
    const h = harness();
    const email = h.newEmail();
    await h.api.register({ email, password: 'violet sunset harbour' });
    const user = await db.user.findUniqueOrThrow({ where: { emailNormalized: email } });
    const [token] = await db.emailToken.findMany({ where: { userId: user.id } });
    expect(token?.pendingPasswordHash?.startsWith('scrypt$')).toBe(true);
  });

  it('resent_verification_link_keeps_the_current_password', async () => {
    const h = harness();
    const email = h.newEmail();
    await h.api.register({ email, password: 'violet sunset harbour' });
    h.clock.advance(60_000);
    await h.api.resend(email);
    expect((await h.api.verify(await h.lastToken(email))).status).toBe(200);
    expect((await h.api.login(email, 'violet sunset harbour')).status).toBe(200);
  });

  it('registering_again_on_a_verified_account_changes_nothing', async () => {
    const h = harness();
    const { email } = await h.signedIn();
    const before = await h.outbox(email);
    await h.api.register({ email, password: 'another long password' });
    expect(await h.outbox(email)).toHaveLength(before.length);
    expect((await h.api.login(email, 'another long password')).status).toBe(401);
    expect((await h.api.login(email, 'violet sunset harbour')).status).toBe(200);
  });
});

describe('login racing a password reset (I3)', () => {
  it('a_login_that_verified_the_old_password_before_a_reset_gets_no_session', async () => {
    let resetDuringLogin: (() => Promise<unknown>) | undefined;
    const h = harness({ hooks: { afterPasswordCheck: async () => void (await resetDuringLogin?.()) } });
    const { email, userId } = await h.signedIn();
    await h.api.forgot(email);
    const token = await h.lastToken(email);
    resetDuringLogin = async () => {
      resetDuringLogin = undefined; // once
      expect((await h.api.reset(token, 'the brand new passphrase')).status).toBe(200);
    };
    const login = await h.api.login(email, 'violet sunset harbour'); // old password, checked before the reset commits
    expect(login.body).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(login.headers.getSetCookie()).toEqual([]);
    const live = await db.sessionRegistry.count({ where: { userId, revokedAt: null } });
    expect(live).toBe(0);
    expect((await h.api.login(email, 'the brand new passphrase')).status).toBe(200);
  });

  it('a_session_older_than_the_last_password_change_is_401', async () => {
    const h = harness();
    const { cookie, userId } = await h.signedIn();
    h.clock.advance(1_000);
    // password changed by a path that did not revoke this session (defence in depth)
    await db.credential.update({ where: { userId }, data: { updatedAt: h.clock.now() } });
    expect((await h.api.me(cookie)).body).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('rehash_on_login_upgrades_legacy_hashes_without_ending_other_sessions', async () => {
    const { scryptSync } = await import('node:crypto');
    const h = harness();
    const { email, userId, cookie } = await h.signedIn();
    const salt = Buffer.alloc(16, 3);
    const legacy = `scrypt$16384$8$1$${salt.toString('base64')}$${scryptSync('violet sunset harbour', salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')}`;
    const before = await db.credential.update({ where: { userId }, data: { passwordHash: legacy } });
    h.clock.advance(1_000);
    expect((await h.api.login(email, 'violet sunset harbour')).status).toBe(200);
    const after = await db.credential.findUniqueOrThrow({ where: { userId } });
    expect(after.passwordHash.startsWith('scrypt$32768$')).toBe(true);
    expect(after.updatedAt).toEqual(before.updatedAt); // a rehash is not a password change
    expect((await h.api.me(cookie)).status).toBe(200);
  });

  it('rehash_is_a_compare_and_set_that_never_overwrites_a_newer_password', async () => {
    const { createPrismaIdentityStore } = await import('@/modules/identity/infrastructure/prisma-store');
    const h = harness();
    const { userId } = await h.signedIn();
    const store = createPrismaIdentityStore(db);
    const current = (await db.credential.findUniqueOrThrow({ where: { userId } })).passwordHash;
    expect(await store.rehashPassword(userId, 'scrypt$stale-expected', 'scrypt$would-revert')).toBe(false);
    expect((await db.credential.findUniqueOrThrow({ where: { userId } })).passwordHash).toBe(current);
    expect(await store.rehashPassword(userId, current, `${current}x`)).toBe(true);
  });
});

describe('account status on reset and sessions (M3)', () => {
  it('reset_token_of_a_disabled_account_is_400_INVALID_TOKEN_and_changes_nothing', async () => {
    const h = harness();
    const { email, userId } = await h.signedIn();
    await h.api.forgot(email);
    const token = await h.lastToken(email);
    const before = await db.credential.findUniqueOrThrow({ where: { userId } });
    await db.user.update({ where: { id: userId }, data: { status: 'DISABLED' } });
    expect((await h.api.reset(token, 'the brand new passphrase')).body).toMatchObject({ status: 400, code: 'INVALID_TOKEN' });
    expect((await db.credential.findUniqueOrThrow({ where: { userId } })).passwordHash).toBe(before.passwordHash);
  });

  it('deletion_requested_user_session_is_401', async () => {
    const h = harness();
    const { cookie, userId } = await h.signedIn();
    await db.user.update({ where: { id: userId }, data: { status: 'DELETION_REQUESTED' } });
    expect((await h.api.me(cookie)).body).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });
});

describe('missing coverage from the review', () => {
  it('a_token_of_one_purpose_is_refused_by_the_other_and_is_not_burned', async () => {
    const h = harness();
    const email = h.newEmail();
    await h.api.register({ email, password: 'violet sunset harbour' });
    const verifyToken = await h.lastToken(email);
    expect((await h.api.reset(verifyToken, 'the brand new passphrase')).body).toMatchObject({ code: 'INVALID_TOKEN' });
    expect((await h.api.verify(verifyToken)).status).toBe(200); // still usable for its own purpose

    await h.api.forgot(email);
    const resetToken = await h.lastToken(email);
    expect((await h.api.verify(resetToken)).body).toMatchObject({ code: 'INVALID_TOKEN' });
    expect((await h.api.reset(resetToken, 'the brand new passphrase')).status).toBe(200);
    expect((await h.api.reset(resetToken, 'yet another passphrase')).body).toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('forgot_is_limited_to_5_per_hour_per_ip_and_email_with_retry_after', async () => {
    const h = harness();
    const email = h.newEmail();
    for (let i = 0; i < 5; i++) expect((await h.api.forgot(email)).status).toBe(202);
    const res = await h.api.forgot(email);
    expect([res.status, res.body?.code]).toEqual([429, 'RATE_LIMITED']);
    const retry = Number(res.headers.get('retry-after'));
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(3600);
    expect((await h.api.forgot(h.newEmail())).status).toBe(202); // other email, same address: own bucket
  });

  it('login_is_limited_to_30_per_15_minutes_per_ip_across_emails', async () => {
    const h = harness();
    for (let i = 0; i < 30; i++) expect((await h.api.login(h.newEmail(), 'wrong password x')).status).toBe(401);
    const res = await h.api.login(h.newEmail(), 'wrong password x');
    expect([res.status, res.body?.code]).toEqual([429, 'RATE_LIMITED']);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    h.clock.advance(15 * 60_000);
    expect((await h.api.login(h.newEmail(), 'wrong password x')).status).toBe(401);
  });
});
