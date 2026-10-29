import type { ObjectStorage } from '@/platform/storage/objects';
import type { Logger } from '@/platform/logger';
import type { GarmentStore } from './ports';
import type { PhotoStore } from './photo-ports';
import { releaseKeys } from './photo-service';

const BATCH = 100;

/**
 * Daily job body. Garment rows (status events and photo rows cascade) go in a transaction per batch; the storage
 * objects go AFTER the commit and only when no remaining photo row (e.g. a duplicate's) references them.
 */
export function createPurgeJob(d: { garments: GarmentStore; photos: PhotoStore; storage: ObjectStorage; log: Logger }) {
  return async function purgeExpiredGarments(now: Date): Promise<{ purged: number }> {
    let purged = 0;
    for (;;) {
      const batch = await d.garments.purgeExpired(now, BATCH);
      purged += batch.ids.length;
      await releaseKeys(d.photos, d.storage, d.log, batch.keys);
      if (batch.ids.length < BATCH) break;
    }
    if (purged) d.log.info({ purged }, 'wardrobe.trash.purged');
    return { purged };
  };
}
