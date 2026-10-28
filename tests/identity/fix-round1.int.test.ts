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
