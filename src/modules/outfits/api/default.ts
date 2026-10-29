import { Redis } from 'ioredis';
import { createGarmentGateway } from '@/modules/wardrobe';
import { withSession } from '@/modules/identity';
import { systemClock } from '@/platform/clock/system';
import { createDb } from '@/platform/db';
import { getEnv } from '@/platform/env';
import { createOutfitsHttp, type OutfitsHttp } from './http';

const g = globalThis as typeof globalThis & { __lookivaOutfits?: OutfitsHttp };

/** Process-wide outfits API built from the environment on first use (never at import or build time). */
function outfits(): OutfitsHttp {
  if (g.__lookivaOutfits) return g.__lookivaOutfits;
  const env = getEnv();
  const db = createDb(env.DATABASE_URL);
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
  return (g.__lookivaOutfits = createOutfitsHttp({ db, redis, clock: systemClock, withSession, garments: createGarmentGateway(db, systemClock) }));
}

type Route = (req: Request) => Promise<Response>;
type IdRoute = (req: Request, id: string) => Promise<Response>;
type Id2Route = (req: Request, id: string, garmentId: string) => Promise<Response>;
const lazy = (pick: (o: OutfitsHttp) => Route): Route => (req) => pick(outfits())(req);
const lazyId = (pick: (o: OutfitsHttp) => IdRoute): IdRoute => (req, id) => pick(outfits())(req, id);
const lazyId2 = (pick: (o: OutfitsHttp) => Id2Route): Id2Route => (req, id, gid) => pick(outfits())(req, id, gid);

/** Handlers for the thin route files under src/app/api/v1. */
export const outfitsRoutes = {
  createOutfit: lazy((o) => o.createOutfit),
  listOutfits: lazy((o) => o.listOutfits),
  lastWorn: lazy((o) => o.lastWorn),
  getOutfit: lazyId((o) => o.getOutfit),
  patchOutfit: lazyId((o) => o.patchOutfit),
  cancelOutfit: lazyId((o) => o.cancelOutfit),
  addItem: lazyId((o) => o.addItem),
  removeItem: lazyId2((o) => o.removeItem),
  replaceItem: lazyId2((o) => o.replaceItem),
  conflicts: lazyId((o) => o.conflicts),
  confirmWorn: lazyId((o) => o.confirmWorn),
  saveAsTemplate: lazyId((o) => o.saveAsTemplate),
  createTemplate: lazy((o) => o.createTemplate),
  listTemplates: lazy((o) => o.listTemplates),
  getTemplate: lazyId((o) => o.getTemplate),
  patchTemplate: lazyId((o) => o.patchTemplate),
  deleteTemplate: lazyId((o) => o.deleteTemplate),
  instantiateTemplate: lazyId((o) => o.instantiateTemplate),
  getWearRecord: lazyId((o) => o.getWearRecord),
  markToWash: lazyId((o) => o.markToWash),
  invalidateWearRecord: lazyId((o) => o.invalidateWearRecord),
  garmentWearHistory: lazyId((o) => o.garmentWearHistory),
};
