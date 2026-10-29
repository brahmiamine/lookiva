import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '@/ui/api-client';

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];
const respond = (res: Response | Error) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (res instanceof Error) throw res;
      return res;
    }),
  );
const problem = (status: number, code: string, headers: Record<string, string> = {}, extra = {}) =>
  new Response(JSON.stringify({ type: `urn:lookiva:problem:${code}`, title: 'x', status, code, detail: 'd', requestId: 'r', ...extra }), {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  });
const header = (name: string) => new Headers(calls.at(-1)?.init.headers).get(name);

afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
});

describe('api client', () => {
  it('sends_csrf_header_json_body_same_origin_cookies_under_api_v1', async () => {
    respond(Response.json({ ok: 1 }));
    const r = await api<{ ok: number }>('/auth/login', { method: 'POST', body: { email: 'a@b.c' } });
    expect(r.data).toEqual({ ok: 1 });
    expect(calls[0]?.url).toBe('/api/v1/auth/login');
    expect(calls[0]?.init.credentials).toBe('same-origin');
    expect(calls[0]?.init.body).toBe('{"email":"a@b.c"}');
    expect(header('X-Requested-With')).toBe('lookiva');
    expect(header('Content-Type')).toBe('application/json');
    expect(header('Idempotency-Key')).toBeNull();
  });

  it('adds_a_valid_idempotency_key_only_when_asked', async () => {
    respond(Response.json({ status: 'accepted' }, { status: 202 }));
    await api('/auth/register', { method: 'POST', body: {}, idempotent: true });
    expect(header('Idempotency-Key')).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  });

  it('passes_if_match_and_returns_response_headers', async () => {
    respond(Response.json({ version: 2 }, { headers: { ETag: 'W/"v2"' } }));
    const r = await api('/me/preferences', { method: 'PATCH', body: {}, ifMatch: 'W/"v1"' });
    expect(header('If-Match')).toBe('W/"v1"');
    expect(r.headers.get('ETag')).toBe('W/"v2"');
  });

  it('returns_undefined_data_on_204', async () => {
    respond(new Response(null, { status: 204 }));
    expect((await api('/auth/logout', { method: 'POST' })).data).toBeUndefined();
  });

  it('parses_problem_json_into_a_typed_error_with_field_errors', async () => {
    respond(problem(400, 'VALIDATION_ERROR', {}, { errors: [{ path: 'password', message: 'too_common' }] }));
    const e = await api('/auth/register', { method: 'POST', body: {} }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', errors: [{ path: 'password', message: 'too_common' }] });
  });

  it('reads_retry_after_seconds_on_429', async () => {
    respond(problem(429, 'RATE_LIMITED', { 'Retry-After': '700' }));
    const e = (await api('/auth/login', { method: 'POST', body: {} }).catch((x: unknown) => x)) as ApiError;
    expect(e.code).toBe('RATE_LIMITED');
    expect(e.retryAfterSeconds).toBe(700);
  });

  it('maps_non_json_and_network_failures_to_stable_codes_without_the_body', async () => {
    respond(new Response('<html>secret stack</html>', { status: 502 }));
    const e1 = (await api('/me').catch((x: unknown) => x)) as ApiError;
    expect(e1).toMatchObject({ status: 502, code: 'HTTP_ERROR' });
    expect(e1.message).not.toContain('secret');
    respond(new TypeError('Failed to fetch'));
    expect(await api('/me').catch((x: unknown) => x)).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('never_logs', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
    respond(problem(401, 'INVALID_CREDENTIALS'));
    await api('/auth/login', { method: 'POST', body: { password: 'hunter2hunter2' } }).catch(() => {});
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
