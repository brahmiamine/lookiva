// Public surface of the outfits module (the only file other code may import).
import './api/openapi'; // registers the outfits routes in the OpenAPI registry
import type { PrismaClient } from '@/generated/prisma/client';
import { createPrismaUsageChecker } from './infrastructure/prisma-store';
export { createOutfitsHttp, type OutfitsHttp, type OutfitsHttpDeps } from './api/http';
export { outfitsRoutes } from './api/default';
export { ROLES, type Role } from './domain/roles';
export { OUTFIT_STATUSES, type OutfitStatus } from './domain/outfit';

/** Implements wardrobe's GarmentUsageChecker: garments in DRAFT/PLANNED outfits produce warnings on trash / bulk delete. */
export const createOutfitUsageChecker = (db: PrismaClient) => createPrismaUsageChecker(db);

export { createPrismaOutfitReader as createOutfitReader, type OutfitReader, type OutfitSchedule } from './infrastructure/prisma-reader';
