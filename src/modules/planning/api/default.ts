import { Redis } from 'ioredis';
import { createDb } from '@/platform/db';
import { getEnv } from '@/platform/env';
import { systemClock } from '@/platform/clock/system';
import { createLogger } from '@/platform/logger';
import { withSession } from '@/modules/identity';
import { createGarmentGateway } from '@/modules/wardrobe';
import { createPlanningHttp } from './http';
let instance: ReturnType<typeof createPlanningHttp> | undefined;
function get() { if (instance)
    return instance; const e = getEnv(), db = createDb(e.DATABASE_URL), redis = new Redis(e.REDIS_URL, { maxRetriesPerRequest: 2 }); redis.on('error', err => createLogger().error({ err }, 'planning redis error')); return instance = createPlanningHttp({ db, redis, clock: systemClock, withSession, garments: createGarmentGateway(db, systemClock) }); }
const resource = (kind: 'events' | 'trips') => ({ list: (r: Request) => get()[kind].list(r), create: (r: Request) => get()[kind].create(r), get: (r: Request, id: string) => get()[kind].get(r, id), update: (r: Request, id: string) => get()[kind].update(r, id), remove: (r: Request, id: string) => get()[kind].remove(r, id) });
export const planningRoutes = { events: resource('events'), trips: resource('trips'), occurrences: (r: Request, id: string) => get().occurrences(r, id), packing: (r: Request, id: string) => get().packing(r, id) };
