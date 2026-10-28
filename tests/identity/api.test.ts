import { describe, expect, it } from 'vitest';
import { clearSessionCookie, readSessionCookie, sessionCookie } from '@/modules/identity/api/cookie';
import { assertCsrf } from '@/modules/identity/api/csrf';
import { rateLimitId } from '@/modules/identity/api/limits';
import { summariseUserAgent } from '@/modules/identity/domain/user-agent';

const TOKEN = 'a'.repeat(43);
const req = (method: string, headers: Record<string, string>) =>
  new Request('http://localhost:3000/api/v1/x', { method, headers });

describe('session cookie', () => {
  it('reads_only_a_well_formed_lookiva_session_value', () => {
    expect(readSessionCookie(req('GET', { cookie: `theme=dark; lookiva_session=${TOKEN}; x=1` }))).toBe(TOKEN);
    expect(readSessionCookie(req('GET', { cookie: 'lookiva_session=short' }))).toBeNull();
    expect(readSessionCookie(req('GET', { cookie: `xlookiva_session=${TOKEN}` }))).toBeNull();
    expect(readSessionCookie(req('GET', {}))).toBeNull();
  });

  it('dev_cookie_is_httponly_lax_root_without_secure', () => {
    expect(sessionCookie(TOKEN, false)).toBe(`lookiva_session=${TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000`);
  });

  it('production_cookie_adds_secure', () => {
    expect(sessionCookie(TOKEN, true)).toBe(`lookiva_session=${TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000; Secure`);
    expect(clearSessionCookie(true)).toBe('lookiva_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure');
  });
});

describe('assertCsrf', () => {
  const cfg = { trustProxy: false };
  const rejects = (r: Request, c: { trustProxy: boolean; appOrigin?: string } = cfg) =>
    expect(() => assertCsrf(r, c)).toThrowError(expect.objectContaining({ status: 403, code: 'CSRF_REJECTED' }));

  it('safe_methods_are_never_checked', () => {
    expect(() => assertCsrf(req('GET', { origin: 'https://evil.test' }), cfg)).not.toThrow();
  });

  it('unsafe_methods_need_the_x_requested_with_header', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) rejects(req(m, {}));
    rejects(req('POST', { 'x-requested-with': 'XMLHttpRequest' }));
    expect(() => assertCsrf(req('DELETE', { 'x-requested-with': 'lookiva' }), cfg)).not.toThrow();
  });

  it('a_present_origin_must_equal_the_request_origin', () => {
    const h = { 'x-requested-with': 'lookiva' };
    expect(() => assertCsrf(req('POST', { ...h, origin: 'http://localhost:3000' }), cfg)).not.toThrow();
    rejects(req('POST', { ...h, origin: 'https://evil.test' }));
    rejects(req('POST', { ...h, origin: 'null' }));
    rejects(req('POST', { ...h, origin: 'https://localhost:3000' }));
    rejects(req('POST', { ...h, origin: 'http://localhost:3000' }), { trustProxy: false, appOrigin: 'https://app.example.com' });
  });
});

describe('rateLimitId', () => {
  it('spoofed_x_forwarded_for_does_not_change_the_key_without_trust_proxy', () => {
    const a = rateLimitId(req('POST', { 'x-forwarded-for': '1.1.1.1' }), false, 'a@b.test');
    const b = rateLimitId(req('POST', { 'x-forwarded-for': '9.9.9.9' }), false, 'a@b.test');
    expect(a).toBe(b);
  });

  it('trusted_hop_and_email_both_shape_the_key_and_the_email_is_hashed', () => {
    const k = rateLimitId(req('POST', { 'x-forwarded-for': '1.1.1.1, 10.0.0.1' }), true, 'a@b.test');
    expect(k).toMatch(/^10\.0\.0\.1:[0-9a-f]{32}$/);
    expect(k).not.toContain('a@b.test');
    expect(rateLimitId(req('POST', { 'x-forwarded-for': '10.0.0.2' }), true, 'a@b.test')).not.toBe(k);
    expect(rateLimitId(req('POST', { 'x-forwarded-for': '10.0.0.1' }), true, 'c@b.test')).not.toBe(k);
    expect(rateLimitId(req('POST', { 'x-forwarded-for': '10.0.0.1' }), true)).toBe('10.0.0.1');
  });
});

describe('summariseUserAgent', () => {
  it('keeps_only_browser_and_os', () => {
    const cases: [string | null, string][] = [
      ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', 'Chrome on Windows'],
      ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'Safari on iOS'],
      ['Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36', 'Chrome on Android'],
      ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox on macOS'],
      ['Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0', 'Edge on Windows'],
      ['curl/8.0', 'Unknown browser on unknown OS'],
      [null, 'Unknown browser on unknown OS'],
    ];
    for (const [ua, out] of cases) expect(summariseUserAgent(ua), String(ua)).toBe(out);
  });
});
