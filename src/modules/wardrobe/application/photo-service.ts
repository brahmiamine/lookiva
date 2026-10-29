import type { Clock } from '@/platform/clock/port';
import { AppError } from '@/platform/http/errors';
import { newId } from '@/platform/http/ids';
import type { OwnerId } from '@/platform/kernel';
import type { BackgroundRemover } from '@/platform/background-remover/port';
import type { ObjectStorage } from '@/platform/storage/objects';
import type { Logger } from '@/platform/logger';
import { MAX_PHOTOS_PER_GARMENT, photoKeys, type Crop, type Variant } from '../domain/photo';
import type { GarmentStore } from './ports';
import type { ImageProcessor, PhotoRow, PhotoStore, PhotoView } from './photo-ports';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (what: string) => new AppError('NOT_FOUND', 404, `${what} not found`);
const full = () => new AppError('PHOTO_LIMIT_REACHED', 409, `A garment holds at most ${MAX_PHOTOS_PER_GARMENT} photos`);

export const toPhotoView = (r: PhotoRow): PhotoView => ({
  id: r.id, garmentId: r.garmentId, position: r.position, isPrimary: r.isPrimary, cutoutStatus: r.cutoutStatus,
  mime: r.mime, bytes: r.bytes, width: r.width, height: r.height, sha256: r.sha256, createdAt: r.createdAt.toISOString(),
});

export type PhotoDeps = {
  photos: PhotoStore;
  garments: GarmentStore;
  storage: ObjectStorage;
  processor: ImageProcessor;
  remover: BackgroundRemover;
  clock: Clock;
  log: Logger;
};

export function createPhotoService(d: PhotoDeps) {
  const { photos, storage } = d;

  const ownGarment = async (owner: OwnerId, id: string) => {
    if (!UUID_RE.test(id) || !(await d.garments.findById(owner, id))) throw notFound('Garment');
  };
  const ownPhoto = async (owner: OwnerId, garmentId: string, photoId: string): Promise<PhotoRow> => {
    await ownGarment(owner, garmentId);
    const r = UUID_RE.test(photoId) ? await photos.find(owner, garmentId, photoId) : null;
    if (!r) throw notFound('Photo');
    return r;
  };

  /** Storage deletes happen only AFTER the database commit, and only for keys no row references. Failures are logged as purge candidates. */
  async function release(keys: (string | null)[]): Promise<void> {
    const dead = await photos.unreferenced(keys.filter((k): k is string => k !== null)).catch((err) => {
      d.log.error({ err, keys }, 'photo.storage.purge_candidate (reference check failed)');
      return [] as string[];
    });
    for (const key of dead) {
      await storage.delete(key).catch((err) => d.log.error({ err, key }, 'photo.storage.purge_candidate'));
    }
  }

  return {
    async list(owner: OwnerId, garmentId: string): Promise<PhotoView[]> {
      await ownGarment(owner, garmentId);
      return (await photos.list(owner, garmentId)).map(toPhotoView);
    },

    /** Early limit check, so a 6th upload is refused before its body is read. */
    async assertCanUpload(owner: OwnerId, garmentId: string): Promise<void> {
      await ownGarment(owner, garmentId);
      if ((await photos.list(owner, garmentId)).length >= MAX_PHOTOS_PER_GARMENT) throw full();
    },

    async upload(owner: OwnerId, garmentId: string, file: { bytes: Uint8Array; declaredMime: string; rotate: number; crop?: Crop }): Promise<PhotoView> {
      await this.assertCanUpload(owner, garmentId);
      const img = await d.processor.process(file.bytes, file.declaredMime, { rotate: file.rotate, crop: file.crop });
      const id = newId();
      const k = photoKeys(owner, id);
      const written: string[] = [];
      try {
        // Objects first, row second: a crash in between leaves unreferenced objects, never a row without bytes.
        for (const [key, body, type] of [[k.original, file.bytes, img.mime], [k.optimized, img.optimized, 'image/webp'], [k.thumb, img.thumb, 'image/webp']] as const) {
          await storage.put(key, body, type);
          written.push(key);
        }
        const row = await photos.add(owner, {
          id, garmentId, ownerId: owner, originalKey: k.original, optimizedKey: k.optimized, thumbKey: k.thumb,
          mime: img.mime, bytes: file.bytes.byteLength, width: img.width, height: img.height, sha256: img.sha256, createdAt: d.clock.now(),
        });
        if (row === 'full') throw full();
        if (row === 'gone') throw notFound('Garment');
        return toPhotoView(row);
      } catch (err) {
        // Compensation: nothing references these keys (the row never committed).
        for (const key of written) await storage.delete(key).catch((e) => d.log.error({ err: e, key }, 'photo.storage.purge_candidate'));
        throw err;
      }
    },

    async setPrimary(owner: OwnerId, garmentId: string, photoId: string): Promise<PhotoView> {
      await ownPhoto(owner, garmentId, photoId);
      if (!(await photos.setPrimary(owner, garmentId, photoId))) throw notFound('Photo');
      return toPhotoView(await ownPhoto(owner, garmentId, photoId));
    },

    async remove(owner: OwnerId, garmentId: string, photoId: string): Promise<void> {
      await ownGarment(owner, garmentId);
      const row = UUID_RE.test(photoId) ? await photos.remove(owner, garmentId, photoId) : null;
      if (!row) throw notFound('Photo');
      await release([row.originalKey, row.optimizedKey, row.thumbKey, row.cutoutKey]);
    },

    /** Streams one variant to the owner. Never a public URL: callers must sit behind the session guard. */
    async file(owner: OwnerId, garmentId: string, photoId: string, variant: Variant): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }> {
      const r = await ownPhoto(owner, garmentId, photoId);
      const [key, contentType] =
        variant === 'original' ? [r.originalKey, r.mime]
        : variant === 'optimized' ? [r.optimizedKey, 'image/webp']
        : variant === 'thumb' ? [r.thumbKey, 'image/webp']
        : [r.cutoutStatus === 'READY' ? r.cutoutKey : null, 'image/png'];
      const body = key ? await storage.get(key) : null;
      if (!body) {
        if (key) d.log.error({ photoId, variant }, 'photo object missing from storage');
        throw notFound('Photo file');
      }
      return { body, contentType };
    },

    /** Local background removal. A failure keeps the photo and its previous cutout and reports cutoutStatus FAILED. */
    async cutout(owner: OwnerId, garmentId: string, photoId: string): Promise<PhotoView> {
      const r = await ownPhoto(owner, garmentId, photoId);
      let key: string | undefined;
      try {
        const src = await storage.get(r.optimizedKey);
        if (!src) throw new Error('optimized object missing');
        const png = await d.remover.remove(new Uint8Array(await new Response(src).arrayBuffer()));
        key = `photos/${owner}/${photoId}/cutout-${newId()}.png`;
        await storage.put(key, png, 'image/png');
        const next = await photos.setCutout(owner, garmentId, photoId, { status: 'READY', key });
        if (!next) throw notFound('Photo');
        await release([r.cutoutKey]);
        return toPhotoView(next);
      } catch (err) {
        if (key) await storage.delete(key).catch(() => undefined);
        if (err instanceof AppError) throw err;
        d.log.warn({ err, photoId }, 'cutout failed; original photo kept');
        const next = await photos.setCutout(owner, garmentId, photoId, { status: 'FAILED' });
        return toPhotoView(next ?? r);
      }
    },

    /**
     * For duplication (next slice): `target` (empty) gets one row per photo of `source`, SHARING the storage objects.
     * Deleting a photo then only removes objects no row references. Known ceiling: a delete racing a copy of the same
     * photo could drop an object just before the copy commits; duplicate-by-copy would remove it, sharing keeps it cheap.
     */
    async copyPhotosToGarment(owner: OwnerId, sourceGarmentId: string, targetGarmentId: string): Promise<number> {
      await ownGarment(owner, sourceGarmentId);
      await ownGarment(owner, targetGarmentId);
      const r = await photos.copyAll(owner, sourceGarmentId, targetGarmentId, newId, d.clock.now());
      if (r === 'not_empty') throw new AppError('TARGET_HAS_PHOTOS', 409, 'Target garment already has photos');
      if (r === 'gone') throw notFound('Garment');
      return r;
    },
  };
}
export type PhotoService = ReturnType<typeof createPhotoService>;
