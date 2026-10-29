import { Redis } from 'ioredis';
import { getEnv } from '@/platform/env';
import { createDb } from '@/platform/db';
import { systemClock } from '@/platform/clock/system';
import { createRateLimiter } from '@/platform/rate-limit';
import { createLogger } from '@/platform/logger';
import { withSession } from '@/modules/identity';
import { createNotificationsHttp } from './http';
let instance: ReturnType<typeof createNotificationsHttp> | undefined;
function get() { if (instance)
    return instance; const e = getEnv(), redis = new Redis(e.REDIS_URL, { maxRetriesPerRequest: 2 }); redis.on('error', err => createLogger().error({ err }, 'notifications redis error')); return instance = createNotificationsHttp({ db: createDb(e.DATABASE_URL), clock: systemClock, limiter: createRateLimiter(redis), withSession }); }
export const notificationsRoutes = { list: (r: Request) => get().list(r), refresh: (r: Request) => get().refresh(r), getPreferences: (r: Request) => get().getPreferences(r), setPreferences: (r: Request) => get().setPreferences(r), read: (r: Request, id: string) => get().read(r, id), dismiss: (r: Request, id: string) => get().dismiss(r, id) };
