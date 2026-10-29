import { Redis } from 'ioredis';
import type { PrismaClient } from '@/generated/prisma/client';
import type { OwnerId } from '@/platform/kernel';
import { withSession } from '@/modules/identity';
import { systemClock } from '@/platform/clock/system';
import { createDb } from '@/platform/db';
import { getEnv } from '@/platform/env';
import { WhiteKeyRemover } from '@/platform/background-remover/local';
import { LocalObjectStorage } from '@/platform/storage/local';
import { createLogger } from '@/platform/logger';
import { createWardrobeHttp, type WardrobeHttp } from './http';
import type { OrganizerHttp } from './organizer-http';

const g = globalThis as typeof globalThis & { __lookivaWardrobe?: WardrobeHttp; __lookivaDb?: PrismaClient; __lookivaRedis?: Redis };

/** Process-wide wardrobe API built from the environment on first use (never at import or build time). */
function wardrobe(): WardrobeHttp {
  if (g.__lookivaWardrobe) return g.__lookivaWardrobe;
  const env = getEnv();
  const logger = createLogger({ level: env.LOG_LEVEL });
  if (!g.__lookivaRedis) {
    g.__lookivaRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
    g.__lookivaRedis.on('error', (err) => logger.error({ err }, 'redis error (wardrobe)'));
  }
  const redis = g.__lookivaRedis;
  const db = (g.__lookivaDb ??= createDb(env.DATABASE_URL));
  // Outfits (which depend on wardrobe) are loaded lazily to keep the module graph acyclic at load time.
  const usage = {
    // Advisory only: a failing check degrades to "no warning" instead of failing the trash / delete.
    check: async (o: OwnerId, ids: string[]) => {
      try {
        return await (await import('@/modules/outfits')).createOutfitUsageChecker(db).check(o, ids);
      } catch (err) {
        logger.error({ err }, 'outfit usage check failed');
        return [];
      }
    },
  };
  return (g.__lookivaWardrobe = createWardrobeHttp({ db, usage, redis, clock: systemClock, withSession, logger, storage: new LocalObjectStorage(env.STORAGE_LOCAL_DIR), remover: new WhiteKeyRemover(), limits: { photoQuotaBytes: env.PHOTO_QUOTA_BYTES } }));
}

type Route = (req: Request) => Promise<Response>;
type IdRoute = (req: Request, id: string) => Promise<Response>;
const lazy = (pick: (w: WardrobeHttp) => Route): Route => (req) => pick(wardrobe())(req);
type Id2Route = (req: Request, id: string, photoId: string) => Promise<Response>;
const lazyId2 = (pick: (w: WardrobeHttp) => Id2Route): Id2Route => (req, id, photoId) => pick(wardrobe())(req, id, photoId);
const lazyId = (pick: (w: WardrobeHttp) => IdRoute): IdRoute => (req, id) => pick(wardrobe())(req, id);

const organizerRoutes = (pick: (w: WardrobeHttp) => OrganizerHttp) => ({
  create: lazy((w) => pick(w).create),
  list: lazy((w) => pick(w).list),
  get: lazyId((w) => pick(w).get),
  rename: lazyId((w) => pick(w).rename),
  remove: lazyId((w) => pick(w).remove),
  attach: lazyId((w) => pick(w).attach),
  detach: lazyId2((w) => pick(w).detach),
});

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
  listPhotos: lazyId((w) => w.listPhotos),
  uploadPhoto: lazyId((w) => w.uploadPhoto),
  setPrimaryPhoto: lazyId2((w) => w.setPrimaryPhoto),
  deletePhoto: lazyId2((w) => w.deletePhoto),
  cutoutPhoto: lazyId2((w) => w.cutoutPhoto),
  photoFile: lazyId2((w) => w.photoFile),
  duplicateGarment: lazyId((w) => w.duplicateGarment),
  bulkActions: lazy((w) => w.bulkActions),
  listTrash: lazy((w) => w.listTrash),
  restoreGarment: lazyId((w) => w.restoreGarment),
  tags: organizerRoutes((w) => w.tags),
  collections: organizerRoutes((w) => w.collections),
  garmentSets: organizerRoutes((w) => w.garmentSets),
  createCustomSubcategory: lazy((w) => w.createCustomSubcategory),
  listCustomSubcategories: lazy((w) => w.listCustomSubcategories),
  updateCustomSubcategory: lazyId((w) => w.updateCustomSubcategory),
  deleteCustomSubcategory: lazyId((w) => w.deleteCustomSubcategory),
  createOutfit: lazy((w) => w.outfits.create),
  getOutfit: lazyId((w) => w.outfits.get),
  listOutfits: lazy((w) => w.outfits.list),
  garmentWears: lazyId((w) => w.outfits.wears),
  markWearToWash: lazyId((w) => w.outfits.markToWash),
  updateOutfit: lazyId((w) => w.outfits.update),
  confirmOutfitWorn: lazyId((w) => w.outfits.confirmWorn),
};
