import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { Redis } from 'ioredis';
import { FakeAudit, FakeClock } from '@/platform';
import { createDb } from '@/platform/db';
import { OutboxEmail, readOutbox } from '@/platform/email/outbox';
import { createLogger } from '@/platform/logger';
import { createIdentityHttp, type IdentityHttp } from '@/modules/identity';
import { testDatabaseUrl, testRedisUrl } from '../setup/db-url';

export const db = createDb(testDatabaseUrl());
export const redis = new Redis(testRedisUrl());
export const closeAll = async () => {
  await db.$disconnect();
  await redis.quit();
};

export const ORIGIN = 'http://localhost:3000';
export const PASSWORD = 'violet sunset harbour';

type Opts = { production?: boolean; trustProxy?: boolean; appOrigin?: string; withEmail?: boolean };

/** A fresh identity API on the real db/redis, with its own rate-limit namespace, clock, audit and captured logs. */
export function harness(opts: Opts = {}) {
  let logs = '';
  const destination = new Writable({ write: (c, _e, cb) => ((logs += c.toString()), cb()) });
  const clock = new FakeClock(new Date());
  const audit = new FakeAudit();
  const http: IdentityHttp = createIdentityHttp({
    db,
    redis,
    clock,
    audit,
    email: opts.withEmail === false ? null : new OutboxEmail(db, clock),
    logger: createLogger({ destination, level: 'debug' }),
    config: { production: opts.production ?? false, trustProxy: opts.trustProxy ?? true, appOrigin: opts.appOrigin },
    rateLimitPrefix: `rl-test-${randomUUID()}`,
  });
  // Every test client gets its own address, so per-IP limits never leak between tests.
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const responses: string[] = [];

  const request = (path: string, init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) => {
    const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
    const headers: Record<string, string> = {
      'x-forwarded-for': ip,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
      ...(method === 'GET' ? {} : { 'x-requested-with': 'lookiva', origin: ORIGIN }),
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(init.cookie ? { cookie: `lookiva_session=${init.cookie}` } : {}),
      ...init.headers,
    };
    for (const [k, v] of Object.entries(headers)) if (v === '') delete headers[k];
    return new Request(`${ORIGIN}/api/v1${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  };

  const send = async (handler: (req: Request) => Promise<Response>, req: Request) => {
    const res = await handler(req);
    const text = await res.text();
    if (res.status >= 500 && res.status !== 503) console.error(logs); // a 500 is a bug: show why
    responses.push(text, JSON.stringify([...res.headers]));
    return { status: res.status, headers: res.headers, text, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
  };

  const idem = () => ({ 'idempotency-key': `k-${randomUUID()}` });

  const api = {
    register: (body: unknown, headers: Record<string, string> = idem()) => send(http.register, request('/auth/register', { body, headers })),
    verify: (token: string) => send(http.verifyEmail, request('/auth/email/verify', { body: { token } })),
    resend: (email: string) => send(http.resendVerification, request('/auth/email/resend', { body: { email } })),
    login: (email: string, password: string, headers?: Record<string, string>) =>
      send(http.login, request('/auth/login', { body: { email, password }, headers })),
    logout: (cookie: string) => send(http.logout, request('/auth/logout', { method: 'POST', cookie })),
    logoutAll: (cookie: string) => send(http.logoutAll, request('/auth/logout-all', { method: 'POST', cookie })),
    forgot: (email: string, headers: Record<string, string> = idem()) =>
      send(http.forgotPassword, request('/auth/password/forgot', { body: { email }, headers })),
    reset: (token: string, password: string, headers: Record<string, string> = idem()) =>
      send(http.resetPassword, request('/auth/password/reset', { body: { token, password }, headers })),
    me: (cookie?: string) => send(http.me, request('/me', { cookie })),
    sessions: (cookie: string, query = '') => send(http.listSessions, request(`/me/sessions${query}`, { cookie })),
    revoke: (cookie: string, id: string, headers?: Record<string, string>) =>
      send((r) => http.revokeSession(r, id), request(`/me/sessions/${id}`, { method: 'DELETE', cookie, headers })),
    prefs: (cookie: string) => send(http.getPreferences, request('/me/preferences', { cookie })),
    patchPrefs: (cookie: string, body: unknown, ifMatch?: string) =>
      send(
        http.updatePreferences,
        request('/me/preferences', { method: 'PATCH', body, cookie, headers: ifMatch === undefined ? {} : { 'if-match': ifMatch } }),
      ),
    onboarding: (cookie: string, body: unknown) => send(http.completeOnboarding, request('/me/onboarding', { body, cookie })),
  };

  const outbox = (to: string) => readOutbox(db, to);
  const lastToken = async (to: string): Promise<string> => {
    const mails = await outbox(to);
    const m = /#token=([A-Za-z0-9_-]{43})/.exec(mails.at(-1)?.text ?? '');
    if (!m?.[1]) throw new Error(`no token mailed to ${to}`);
    return m[1];
  };
  const cookieOf = (headers: Headers): string => {
    const c = headers.getSetCookie().find((h) => h.startsWith('lookiva_session='));
    const v = c?.split(';')[0]?.split('=')[1];
    if (!v) throw new Error('no session cookie');
    return v;
  };
  const newEmail = (tag = 'user') => `${tag}-${randomUUID()}@example.test`;

  /** register + verify + login; returns the session cookie value. */
  const signedIn = async (email = newEmail(), password = PASSWORD) => {
    await api.register({ email, password });
    await api.verify(await lastToken(email));
    const res = await api.login(email, password);
    if (res.status !== 200) throw new Error(`login failed ${res.status} ${res.text}`);
    return { email, cookie: cookieOf(res.headers), userId: (res.body?.user as { id: string }).id };
  };

  return { http, api, clock, audit, ip, request, send, outbox, lastToken, cookieOf, newEmail, signedIn, logs: () => logs, responses, idem };
}

/** Problem body without the per-request id, to compare two answers. */
export const shape = (body: Record<string, unknown> | null) => {
  const rest = { ...body };
  delete rest.requestId;
  return rest;
};
