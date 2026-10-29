import { Redis } from 'ioredis';
import { withSession } from '@/modules/identity';
import { systemClock } from '@/platform/clock/system';
import { createDb } from '@/platform/db';
import { getEnv } from '@/platform/env';
import { createLogger } from '@/platform/logger';
import { createWardrobeHttp, type WardrobeHttp } from './http';

const g = globalThis as typeof globalThis & { __lookivaWardrobe?: WardrobeHttp };

/** Process-wide wardrobe API built from the environment on first use (never at import or build time). */
function wardrobe(): WardrobeHttp {
  if (g.__lookivaWardrobe) return g.__lookivaWardrobe;
  const env = getEnv();
  const logger = createLogger({ level: env.LOG_LEVEL });
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
  redis.on('error', (err) => logger.error({ err }, 'redis error (wardrobe)'));
  return (g.__lookivaWardrobe = createWardrobeHttp({ db: createDb(env.DATABASE_URL), redis, clock: systemClock, withSession, logger }));
}

type Route = (req: Request) => Promise<Response>;
type IdRoute = (req: Request, id: string) => Promise<Response>;
const lazy = (pick: (w: WardrobeHttp) => Route): Route => (req) => pick(wardrobe())(req);
const lazyId = (pick: (w: WardrobeHttp) => IdRoute): IdRoute => (req, id) => pick(wardrobe())(req, id);

/** Handlers for the thin route files under src/app/api/v1. */
export const wardrobeRoutes = {
  catalogCategories: lazy((w) => w.catalogCategories),
  catalogColors: lazy((w) => w.catalogColors),
  catalogOptions: lazy((w) => w.catalogOptions),
  createGarment: lazy((w) => w.createGarment),
  listGarments: lazy((w) => w.listGarments),
  getGarment: lazyId((w) => w.getGarment),
  updateGarment: lazyId((w) => w.updateGarment),
  deleteGarment: lazyId((w) => w.deleteGarment),
  changeStatus: lazyId((w) => w.changeStatus),
  statusHistory: lazyId((w) => w.statusHistory),
  createCustomSubcategory: lazy((w) => w.createCustomSubcategory),
  listCustomSubcategories: lazy((w) => w.listCustomSubcategories),
  updateCustomSubcategory: lazyId((w) => w.updateCustomSubcategory),
  deleteCustomSubcategory: lazyId((w) => w.deleteCustomSubcategory),
};
