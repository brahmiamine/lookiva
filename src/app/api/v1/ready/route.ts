import { getEnv } from '@/platform/env';
import { makeDbCheck, makeRedisCheck } from '@/platform/health/checks';
import { createReadyHandler } from '@/platform/health/ready';
import { withApi } from '@/platform/http/with-api';

export const dynamic = 'force-dynamic';

let handler: ReturnType<typeof createReadyHandler> | undefined;

// Built lazily: nothing reads env or touches db/redis at import/build time.
export const GET = withApi((req, ctx) => {
  if (!handler) {
    const env = getEnv();
    handler = createReadyHandler({
      token: env.READY_TOKEN,
      checks: { db: makeDbCheck(env.DATABASE_URL), redis: makeRedisCheck(env.REDIS_URL) },
    });
  }
  return handler(req, ctx);
});
