import { describe, expect, it } from 'vitest';
import { makeDbCheck, makeRedisCheck } from '@/platform/health/checks';
import { createReadyHandler } from '@/platform/health/ready';
import { withApi } from '@/platform/http/with-api';
import { createLogger } from '@/platform/logger';
import { testDatabaseUrl } from '../setup/db-url';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6380';

describe('ready (real db + redis)', () => {
  it('ready_ok_is_200', async () => {
    const handler = withApi(
      createReadyHandler({
        token: 'change-me',
        checks: { db: makeDbCheck(testDatabaseUrl()), redis: makeRedisCheck(REDIS_URL) },
      }),
      { logger: createLogger({ level: 'silent' }) },
    );
    const res = await handler(new Request('http://x/api/v1/ready', { headers: { authorization: 'Bearer change-me' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', checks: { db: 'ok', redis: 'ok' } });
  });
});
