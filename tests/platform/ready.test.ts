import { Writable } from 'node:stream';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { makeDbCheck, makeRedisCheck } from '@/platform/health/checks';
import { createReadyHandler } from '@/platform/health/ready';
import { withApi } from '@/platform/http/with-api';
import { createLogger } from '@/platform/logger';

const TOKEN = 'change-me';
const DOWN_DB = 'mysql://lookiva:change-me@127.0.0.1:1/lookiva';
const DOWN_REDIS = 'redis://127.0.0.1:1';
const ok = () => Promise.resolve();

const logs: string[] = [];
const logger = createLogger({
  level: 'debug',
  destination: new Writable({
    write(chunk: Buffer, _enc, cb) {
      logs.push(chunk.toString());
      cb();
    },
  }),
});

const ready = (checks: { db: () => Promise<void>; redis: () => Promise<void> }) =>
  withApi(createReadyHandler({ token: TOKEN, checks }), { logger });
const call = (h: (r: Request) => Promise<Response>, auth?: string) =>
  h(new Request('http://x/api/v1/ready', { headers: auth === undefined ? {} : { authorization: auth } }));

beforeAll(() => {
  vi.stubEnv('DATABASE_URL', DOWN_DB);
  vi.stubEnv('REDIS_URL', DOWN_REDIS);
  vi.stubEnv('READY_TOKEN', TOKEN);
});

describe('health', () => {
  it('health_is_200_without_touching_db_or_redis', async () => {
    const spy = vi.fn(ok);
    vi.doMock('@/platform/health/checks', () => ({ makeDbCheck: () => spy, makeRedisCheck: () => spy }));
    const { GET } = await import('@/app/api/v1/health/route');
    const res = await GET(new Request('http://x/api/v1/health'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(spy).not.toHaveBeenCalled();
    vi.doUnmock('@/platform/health/checks');
  });

  it('health_stays_200_when_checks_are_down', async () => {
    const down = ready({ db: () => Promise.reject(new Error('x')), redis: () => Promise.reject(new Error('y')) });
    expect((await call(down, `Bearer ${TOKEN}`)).status).toBe(503);
    const { GET } = await import('@/app/api/v1/health/route');
    expect((await GET(new Request('http://x/api/v1/health'))).status).toBe(200);
  });
});

describe('ready', () => {
  it('ready_without_valid_bearer_is_401', async () => {
    const h = ready({ db: ok, redis: ok });
    for (const auth of [undefined, 'Bearer wrong-token', 'Bearer x', `Bearer ${TOKEN}-longer`, 'Bearer ', 'Bearer', TOKEN]) {
      const res = await call(h, auth);
      expect(res.status, String(auth)).toBe(401);
      expect(res.headers.get('content-type')).toBe('application/problem+json');
      const text = await res.text();
      expect(text).not.toContain(TOKEN);
      expect(JSON.parse(text).code).toBe('UNAUTHORIZED');
    }
    expect((await call(h, `Bearer ${TOKEN}`)).status).toBe(200);
  });

  it('ready_returns_503_when_db_unreachable', async () => {
    const res = await call(ready({ db: makeDbCheck(DOWN_DB), redis: ok }), `Bearer ${TOKEN}`);
    await expect503(res, 'db');
  }, 30_000);

  it('ready_returns_503_when_redis_unreachable', async () => {
    const res = await call(ready({ db: ok, redis: makeRedisCheck(DOWN_REDIS) }), `Bearer ${TOKEN}`);
    await expect503(res, 'redis');
  }, 30_000);
});

async function expect503(res: Response, dep: 'db' | 'redis') {
  expect(res.status).toBe(503);
  expect(res.headers.get('content-type')).toBe('application/problem+json');
  const text = await res.text();
  expect(JSON.parse(text).errors[0].path).toBe(dep);
  for (const leak of ['127.0.0.1', 'ECONNREFUSED', 'at ', 'change-me']) expect(text).not.toContain(leak);
  expect(logs.join('')).toContain(`"dependency":"${dep}"`);
}
