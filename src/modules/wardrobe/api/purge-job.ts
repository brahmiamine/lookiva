import type { PrismaClient } from '@/generated/prisma/client';
import type { Logger } from '@/platform/logger';
import type { ObjectStorage } from '@/platform/storage/objects';
import { createPurgeJob } from '../application/purge';
import { createPrismaPhotoStore } from '../infrastructure/prisma-photo-store';
import { createPrismaGarmentStore } from '../infrastructure/prisma-store';

/** Wires the daily trash purge (`purgeExpiredGarments(now)`) for the worker process. */
export const createWardrobePurge = (d: { db: PrismaClient; storage: ObjectStorage; log: Logger }) =>
  createPurgeJob({ garments: createPrismaGarmentStore(d.db), photos: createPrismaPhotoStore(d.db), storage: d.storage, log: d.log });
