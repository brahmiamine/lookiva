import { Redis } from 'ioredis';
import { createDb } from '@/platform/db';
import { getEnv } from '@/platform/env';
import { systemClock } from '@/platform/clock/system';
import { createRateLimiter } from '@/platform/rate-limit';
import { createLogger } from '@/platform/logger';
import { withSession } from '@/modules/identity';
import { createAnalyticsHttp } from './http';
let instance: ReturnType<typeof createAnalyticsHttp> | undefined;
export function analyticsRoute(r: Request) { if (!instance) {
    const e = getEnv(), redis = new Redis(e.REDIS_URL, { maxRetriesPerRequest: 2 });
    redis.on('error', err => createLogger().error({ err }, 'analytics redis error'));
    instance = createAnalyticsHttp({ db: createDb(e.DATABASE_URL), clock: systemClock, withSession, limiter: createRateLimiter(redis) });
} return instance(r); }
