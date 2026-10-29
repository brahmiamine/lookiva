import { afterAll, describe, expect, it } from 'vitest';
import { closeAll, db, harness, PASSWORD, shape } from './harness';

afterAll(closeAll);

const DAY = 86_400_000;

describe('register -> verify -> login', () => {
  it('happy_path_creates_a_verified_account_with_a_working_session', async () => {
    const h = harness();
    const email = h.newEmail();
    const reg = await h.api.register({ email, password: PASSWORD, locale: 'en' });
    expect(reg.status).toBe(202);
    expect(reg.body).toEqual({ status: 'accepted' });

    const mails = await h.outbox(email);
    expect(mails).toHaveLength(1);
    expect(mails[0]?.text).toContain('http://localhost:3000/en/verify-email#token=');

    const ver = await h.api.verify(await h.lastToken(email));
    expect(ver).toMatchObject({ status: 200, body: { status: 'verified' } });

    const login = await h.api.login(email, PASSWORD);
    expect(login.status).toBe(200);
    expect(login.body?.user).toMatchObject({ email, emailVerifiedAt: expect.any(String) });
    const me = await h.api.me(h.cookieOf(login.headers));
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email, id: (login.body?.user as { id: string }).id });
    expect(h.audit.events.map((e) => e.action)).toEqual(['identity.registered', 'identity.email_verified', 'identity.login']);
  });

  it('stores_only_hashes_of_password_and_tokens', async () => {
    const h = harness();
    const { email, cookie, userId } = await h.signedIn();
    const cred = await db.credential.findUniqueOrThrow({ where: { userId } });
    expect(cred.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(cred.passwordHash).not.toContain(PASSWORD);
    const sessions = await db.sessionRegistry.findMany({ where: { userId } });
    expect(sessions.map((s) => s.tokenHash)).not.toContain(cookie);
    expect(sessions[0]?.userAgent).toBe('Chrome on Windows');
    expect(await db.user.count({ where: { email } })).toBe(1);
  });
});

describe('anti-enumeration and duplicates', () => {
  it('register_answers_the_same_for_new_unverified_and_verified_emails', async () => {
    const h = harness();
    const verified = await h.signedIn();
    const fresh = await h.api.register({ email: h.newEmail(), password: PASSWORD });
    const again = await h.api.register({ email: verified.email, password: 'another long password' });
    expect(again.status).toBe(fresh.status);
    expect(again.body).toEqual(fresh.body);
    // the existing account was not touched
    expect((await h.api.login(verified.email, PASSWORD)).status).toBe(200);
  });

  it('case_and_unicode_variants_of_an_email_map_to_one_account', async () => {
    const h = harness();
    const id = crypto.randomUUID();
    const variants = [`Alice-${id}@Example.test`, ` alice-${id}@example.test `, `ＡＬＩＣＥ-${id}@example.test`];
    for (const v of variants) expect((await h.api.register({ email: v, password: PASSWORD })).status).toBe(202);
    expect(await db.user.count({ where: { emailNormalized: `alice-${id}@example.test` } })).toBe(1);
    const composed = `Élodie-${id}@example.test`;
    await h.api.register({ email: composed, password: PASSWORD });
    await h.api.register({ email: composed.normalize('NFD'), password: PASSWORD });
    expect(await db.user.count({ where: { emailNormalized: composed.normalize('NFKC').toLowerCase() } })).toBe(1);
  });

  it('forgot_answers_the_same_for_known_and_unknown_emails', async () => {
    const h = harness();
    const { email } = await h.signedIn();
    const known = await h.api.forgot(email);
    const unknown = await h.api.forgot(h.newEmail('nobody'));
    expect(known.status).toBe(202);
    expect([unknown.status, unknown.body]).toEqual([known.status, known.body]);
  });

  it('resend_answers_the_same_for_unknown_emails_and_respects_the_60s_cooldown', async () => {
    const h = harness();
    const email = h.newEmail();
    await h.api.register({ email, password: PASSWORD });
    const unknown = await h.api.resend(h.newEmail('nobody'));
    const tooSoon = await h.api.resend(email);
    expect([unknown.status, unknown.body]).toEqual([202, { status: 'accepted' }]);
    expect([tooSoon.status, tooSoon.body]).toEqual([202, { status: 'accepted' }]);
    expect(await h.outbox(email)).toHaveLength(1);
    h.clock.advance(60_000);
    await h.api.resend(email);
    expect(await h.outbox(email)).toHaveLength(2);
    // only the newest verification link works
    const mails = await h.outbox(email);
    const first = /#token=([\w-]{43})/.exec(mails[0]?.text ?? '')?.[1] as string;
    expect((await h.api.verify(first)).body).toMatchObject({ code: 'INVALID_TOKEN' });
    expect((await h.api.verify(await h.lastToken(email))).status).toBe(200);
  });

  it('weak_password_is_400_VALIDATION_ERROR_on_password', async () => {
    const h = harness();
    const res = await h.api.register({ email: h.newEmail(), password: 'password1234' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', errors: [{ path: 'password', message: 'too_common' }] });
  });

  it('register_requires_an_idempotency_key_and_replays_it', async () => {
    const h = harness();
    const email = h.newEmail();
    expect((await h.api.register({ email, password: PASSWORD }, {})).body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    const key = h.idem();
    const a = await h.api.register({ email, password: PASSWORD }, key);
    h.clock.advance(120_000); // past the cooldown: a second real run would mail again
    const b = await h.api.register({ email, password: PASSWORD }, key);
    expect([b.status, b.body]).toEqual([a.status, a.body]);
    expect(await h.outbox(email)).toHaveLength(1);
  });
});

describe('email verification tokens', () => {
  it('replayed_token_is_400_INVALID_TOKEN', async () => {
    const h = harness();
    const email = h.newEmail();
    await h.api.register({ email, password: PASSWORD });
    const token = await h.lastToken(email);
    expect((await h.api.verify(token)).status).toBe(200);
    expect((await h.api.verify(token)).body).toMatchObject({ status: 400, code: 'INVALID_TOKEN' });
  });

  it('expired_and_unknown_tokens_get_the_same_400_INVALID_TOKEN', async () => {
    const h = harness();
    const email = h.newEmail();
    await h.api.register({ email, password: PASSWORD });
    const token = await h.lastToken(email);
    h.clock.advance(DAY);
    const expired = await h.api.verify(token);
    const unknown = await h.api.verify('A'.repeat(43));
    const garbage = await h.api.verify('not a token');
    expect(expired.status).toBe(400);
    expect(shape(expired.body)).toEqual(shape(unknown.body));
    expect(shape(garbage.body)).toEqual(shape(unknown.body));
  });

  it('two_concurrent_uses_succeed_exactly_once', async () => {
    const h = harness();
    const email = h.newEmail();
    await h.api.register({ email, password: PASSWORD });
    const token = await h.lastToken(email);
    const results = await Promise.all([h.api.verify(token), h.api.verify(token), h.api.verify(token)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400, 400]);
  });
});

describe('login', () => {
  it('unverified_account_gets_403_only_after_the_right_password', async () => {
    const h = harness();
    const email = h.newEmail();
    await h.api.register({ email, password: PASSWORD });
    const wrong = await h.api.login(email, 'wrong password here');
    expect(wrong.body).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    const right = await h.api.login(email, PASSWORD);
    expect(right.body).toMatchObject({ status: 403, code: 'EMAIL_NOT_VERIFIED' });
    expect(right.headers.getSetCookie()).toEqual([]);
  });

  it('unknown_email_and_wrong_password_are_indistinguishable', async () => {
    const h = harness();
    const { email } = await h.signedIn();
    const unknown = await h.api.login(h.newEmail('nobody'), PASSWORD);
    const wrong = await h.api.login(email, 'definitely not it');
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(shape(unknown.body)).toEqual(shape(wrong.body));
    expect([...unknown.headers.keys()].sort()).toEqual([...wrong.headers.keys()].sort());
  });

  it('disabled_account_is_refused_like_a_wrong_password', async () => {
    const h = harness();
    const { email, userId, cookie } = await h.signedIn();
    await db.user.update({ where: { id: userId }, data: { status: 'DISABLED' } });
    expect((await h.api.login(email, PASSWORD)).body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect((await h.api.me(cookie)).body).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });
});

describe('sessions', () => {
  it('no_or_garbage_cookie_is_401_UNAUTHENTICATED', async () => {
    const h = harness();
    expect((await h.api.me()).body).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect((await h.api.me('A'.repeat(43))).body).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('revoked_session_is_401_even_with_its_valid_cookie', async () => {
    const h = harness();
    const a = await h.signedIn();
    const second = h.cookieOf((await h.api.login(a.email, PASSWORD)).headers);
    const list = await h.api.sessions(second);
    const firstId = (list.body?.items as { id: string; current: boolean }[]).find((s) => !s.current)?.id as string;
    expect((await h.api.revoke(second, firstId)).status).toBe(204);
    expect((await h.api.me(a.cookie)).body).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect((await h.api.me(second)).status).toBe(200);
  });

  it('logout_revokes_the_current_session_and_clears_the_cookie', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    const res = await h.api.logout(cookie);
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie()[0]).toMatch(/^lookiva_session=; .*Max-Age=0/);
    expect((await h.api.me(cookie)).status).toBe(401);
  });

  it('logout_all_revokes_every_session_of_the_user_only', async () => {
    const h = harness();
    const a = await h.signedIn();
    const a2 = h.cookieOf((await h.api.login(a.email, PASSWORD)).headers);
    const b = await h.signedIn();
    expect((await h.api.logoutAll(a.cookie)).status).toBe(204);
    expect((await h.api.me(a.cookie)).status).toBe(401);
    expect((await h.api.me(a2)).status).toBe(401);
    expect((await h.api.me(b.cookie)).status).toBe(200);
  });

  it('idle_session_expires_after_30_days_without_use', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    h.clock.advance(29 * DAY);
    expect((await h.api.me(cookie)).status).toBe(200); // use slides the idle window
    h.clock.advance(29 * DAY);
    expect((await h.api.me(cookie)).status).toBe(200);
    h.clock.advance(30 * DAY);
    expect((await h.api.me(cookie)).status).toBe(401);
  });

  it('active_session_still_dies_at_the_90_day_absolute_limit', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    for (let d = 20; d < 90; d += 20) {
      h.clock.advance(20 * DAY);
      expect((await h.api.me(cookie)).status, `day ${d}`).toBe(200);
    }
    h.clock.advance(10 * DAY); // day 90
    expect((await h.api.me(cookie)).status).toBe(401);
  });

  it('last_seen_is_written_at_most_every_5_minutes', async () => {
    const h = harness();
    const { cookie, userId } = await h.signedIn();
    const seen = async () => (await db.sessionRegistry.findFirstOrThrow({ where: { userId } })).lastSeenAt.getTime();
    const t0 = await seen();
    h.clock.advance(4 * 60_000);
    await h.api.me(cookie);
    expect(await seen()).toBe(t0);
    h.clock.advance(60_000);
    await h.api.me(cookie);
    expect(await seen()).toBe(t0 + 5 * 60_000);
  });
});

describe('password reset', () => {
  it('reset_changes_the_password_and_revokes_every_session', async () => {
    const h = harness();
    const { email, cookie } = await h.signedIn();
    await h.api.forgot(email);
    const token = await h.lastToken(email);
    expect((await h.outbox(email)).at(-1)?.text).toContain('/fr/reset-password#token=');
    const res = await h.api.reset(token, 'a brand new passphrase');
    expect(res).toMatchObject({ status: 200, body: { status: 'password_reset' } });
    expect((await h.api.me(cookie)).status).toBe(401);
    expect((await h.api.login(email, PASSWORD)).status).toBe(401);
    expect((await h.api.login(email, 'a brand new passphrase')).status).toBe(200);
    expect((await h.api.reset(token, 'yet another passphrase')).body).toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('weak_new_password_is_refused_without_burning_the_token', async () => {
    const h = harness();
    const { email } = await h.signedIn();
    await h.api.forgot(email);
    const token = await h.lastToken(email);
    expect((await h.api.reset(token, 'short')).body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await h.api.reset(token, 'a brand new passphrase')).status).toBe(200);
  });

  it('reset_token_expires_after_one_hour', async () => {
    const h = harness();
    const { email } = await h.signedIn();
    await h.api.forgot(email);
    const token = await h.lastToken(email);
    h.clock.advance(3_600_000);
    expect((await h.api.reset(token, 'a brand new passphrase')).body).toMatchObject({ status: 400, code: 'INVALID_TOKEN' });
  });

  it('concurrent_resets_with_one_token_succeed_once', async () => {
    const h = harness();
    const { email } = await h.signedIn();
    await h.api.forgot(email);
    const token = await h.lastToken(email);
    const results = await Promise.all([
      h.api.reset(token, 'first new passphrase'),
      h.api.reset(token, 'second new passphrase'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });
});

describe('rate limits', () => {
  it('login_is_limited_to_10_per_15_minutes_per_ip_and_email', async () => {
    const h = harness();
    const email = h.newEmail();
    for (let i = 0; i < 10; i++) expect((await h.api.login(email, 'wrong password x')).status).toBe(401);
    const limited = await h.api.login(email, 'wrong password x');
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    // another email from the same address is still allowed (per IP limit is 30)
    expect((await h.api.login(h.newEmail(), 'wrong password x')).status).toBe(401);
  });

  it('register_is_limited_to_5_per_hour_per_ip', async () => {
    const h = harness();
    for (let i = 0; i < 5; i++) expect((await h.api.register({ email: h.newEmail(), password: PASSWORD })).status).toBe(202);
    const res = await h.api.register({ email: h.newEmail(), password: PASSWORD });
    expect([res.status, res.body?.code]).toEqual([429, 'RATE_LIMITED']);
    h.clock.advance(3_600_000);
    expect((await h.api.register({ email: h.newEmail(), password: PASSWORD })).status).toBe(202);
  });

  it('token_attempts_are_limited_to_10_per_15_minutes_per_ip', async () => {
    const h = harness();
    for (let i = 0; i < 10; i++) expect((await h.api.verify('B'.repeat(43))).status).toBe(400);
    expect((await h.api.reset('C'.repeat(43), 'a brand new passphrase')).status).toBe(429);
  });

  it('spoofed_x_forwarded_for_does_not_escape_the_limit_without_trust_proxy', async () => {
    const h = harness({ trustProxy: false });
    for (let i = 0; i < 5; i++) {
      const r = h.request('/auth/register', {
        body: { email: h.newEmail(), password: PASSWORD },
        headers: { ...h.idem(), 'x-forwarded-for': `203.0.113.${i}` },
      });
      expect((await h.send(h.http.register, r)).status).toBe(202);
    }
    const r = h.request('/auth/register', {
      body: { email: h.newEmail(), password: PASSWORD },
      headers: { ...h.idem(), 'x-forwarded-for': '198.51.100.99' },
    });
    expect((await h.send(h.http.register, r)).status).toBe(429);
  });
});

describe('csrf', () => {
  it('state_changing_requests_without_x_requested_with_are_403_CSRF_REJECTED', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    const r = h.request('/auth/logout', { method: 'POST', cookie, headers: { 'x-requested-with': '' } });
    expect((await h.send(h.http.logout, r)).body).toMatchObject({ status: 403, code: 'CSRF_REJECTED' });
    const login = h.request('/auth/login', { body: { email: 'a@b.test', password: PASSWORD }, headers: { 'x-requested-with': '' } });
    expect((await h.send(h.http.login, login)).status).toBe(403);
    expect((await h.api.me(cookie)).status).toBe(200);
  });

  it('foreign_origin_is_rejected_and_a_missing_origin_is_allowed', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    const evil = h.request('/me/onboarding', { body: { locale: 'fr', cityName: 'Lyon' }, cookie, headers: { origin: 'https://evil.test' } });
    expect((await h.send(h.http.completeOnboarding, evil)).body).toMatchObject({ code: 'CSRF_REJECTED' });
    const noOrigin = h.request('/me/onboarding', { body: { locale: 'fr', cityName: 'Lyon' }, cookie, headers: { origin: '' } });
    expect((await h.send(h.http.completeOnboarding, noOrigin)).status).toBe(200);
  });

  it('app_origin_is_the_expected_origin_when_configured', async () => {
    const h = harness({ appOrigin: 'https://app.example.com' });
    const r = h.request('/auth/login', { body: { email: 'a@b.test', password: PASSWORD } }); // origin localhost
    expect((await h.send(h.http.login, r)).body).toMatchObject({ code: 'CSRF_REJECTED' });
    const ok = h.request('/auth/login', { body: { email: 'a@b.test', password: PASSWORD }, headers: { origin: 'https://app.example.com' } });
    expect((await h.send(h.http.login, ok)).status).toBe(401);
  });
});

describe('final review fixes', () => {
  it('every_api_answer_is_no_store_including_login_logout_errors_and_private_reads', async () => {
    const h = harness();
    const { email, cookie } = await h.signedIn();
    const login = await h.api.login(email, PASSWORD);
    const answers = [
      login,
      await h.api.login(email, 'wrong password words'),
      await h.api.me(cookie),
      await h.api.sessions(cookie),
      await h.api.prefs(cookie),
      await h.api.consents(cookie),
      await h.api.exports(cookie),
      await h.api.me(undefined),
      await h.api.logout(cookie),
    ];
    for (const r of answers) expect(r.headers.get('cache-control'), `${r.status}`).toBe('no-store');
  });

  it('login_revokes_the_session_the_browser_already_presented', async () => {
    const h = harness();
    const { email, cookie: old } = await h.signedIn();
    const res = await h.send(h.http.login, h.request('/auth/login', { body: { email, password: PASSWORD }, cookie: old }));
    expect(res.status).toBe(200);
    expect((await h.api.me(old)).status).toBe(401);
    expect((await h.api.me(h.cookieOf(res.headers))).status).toBe(200);
  });

  it('logout_and_logout_all_with_a_dead_session_still_clear_the_cookie', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    await h.api.logout(cookie);
    for (const call of [h.api.logout, h.api.logoutAll]) {
      const r = await call(cookie);
      expect(r.status).toBe(401);
      expect(r.headers.getSetCookie().join(';')).toContain('lookiva_session=; ');
      expect(r.headers.getSetCookie().join(';')).toContain('Max-Age=0');
    }
    const none = await h.send(h.http.logout, h.request('/auth/logout', { method: 'POST' }));
    expect(none.headers.getSetCookie().join(';')).toContain('Max-Age=0');
  });
});

describe('cookies, secrets and wiring', () => {
  it('session_cookie_flags_in_dev_have_no_secure', async () => {
    const h = harness({ production: false });
    const { email } = await h.signedIn();
    const c = (await h.api.login(email, PASSWORD)).headers.getSetCookie()[0] ?? '';
    expect(c).toMatch(/^lookiva_session=[\w-]{43}; /);
    for (const flag of ['HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${90 * 86_400}`]) expect(c).toContain(flag);
    expect(c).not.toContain('Secure');
  });

  it('session_cookie_is_secure_in_production', async () => {
    const h = harness({ production: true });
    const { email } = await h.signedIn();
    const c = (await h.api.login(email, PASSWORD)).headers.getSetCookie()[0] ?? '';
    expect(c).toContain('; Secure');
    expect(c).toContain('HttpOnly');
  });

  it('password_and_tokens_never_appear_in_logs_or_responses', async () => {
    const h = harness();
    const secret = 'Tr0ub4dor & 3 secret words';
    const email = h.newEmail();
    await h.api.register({ email, password: secret });
    await h.api.register({ email, password: secret.slice(0, 5) }); // validation error path
    await h.http.register(new Request('http://localhost:3000/api/v1/auth/register', {
      method: 'POST',
      headers: { 'x-requested-with': 'lookiva', 'idempotency-key': 'k-malformed-1', 'x-forwarded-for': h.ip },
      body: `{"email":"${email}","password":"${secret}"`,
    }));
    const verifyToken = await h.lastToken(email);
    await h.api.verify(verifyToken);
    await h.api.login(email, 'wrong but secret-ish words');
    const login = await h.api.login(email, secret);
    const cookie = h.cookieOf(login.headers);
    await h.api.forgot(email);
    const resetToken = await h.lastToken(email);
    await h.api.reset(resetToken, `${secret} v2`);
    const logs = h.logs();
    const bodies = h.responses.filter((r) => !r.includes('set-cookie') && !r.includes(`"email":"${email}"`)).join('\n');
    for (const s of [secret, 'secret-ish', verifyToken, resetToken, cookie, email]) {
      expect(logs, s).not.toContain(s);
      expect(bodies, s).not.toContain(s);
    }
    for (const e of h.audit.events) expect(JSON.stringify(e)).not.toContain('@');
  });

  it('without_an_email_transport_identity_answers_503', async () => {
    const h = harness({ withEmail: false });
    const res = await h.api.register({ email: h.newEmail(), password: PASSWORD });
    expect(res.body).toMatchObject({ status: 503, code: 'EMAIL_TRANSPORT_UNAVAILABLE' });
  });
});
