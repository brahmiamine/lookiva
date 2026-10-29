import type { OwnerId } from '@/platform/kernel';
import type { Crop, DetectedMime } from '../domain/photo';

export type PhotoRow = {
  id: string;
  garmentId: string;
  ownerId: string;
  position: number;
  isPrimary: boolean;
  originalKey: string;
  optimizedKey: string;
  thumbKey: string;
  cutoutKey: string | null;
  cutoutStatus: 'READY' | 'FAILED' | null;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  sha256: string;
  createdAt: Date;
};

/** What the API shows: never storage keys. */
export type PhotoView = Omit<PhotoRow, 'ownerId' | 'originalKey' | 'optimizedKey' | 'thumbKey' | 'cutoutKey' | 'createdAt'> & { createdAt: string };

export type NewPhoto = Omit<PhotoRow, 'position' | 'isPrimary' | 'cutoutKey' | 'cutoutStatus'>;

/** `original` is the upload re-encoded WITHOUT metadata (same format, EXIF orientation applied to the pixels). */
export type ProcessedImage = { mime: DetectedMime; sha256: string; width: number; height: number; original: Uint8Array; optimized: Uint8Array; thumb: Uint8Array };

/** Decodes, orients, strips metadata and derives the optimized + thumbnail variants. Throws AppError for rejects. */
export interface ImageProcessor {
  process(input: Uint8Array, declaredMime: string, opts: { rotate: number; crop?: Crop }): Promise<ProcessedImage>;
}

export interface PhotoStore {
  list(ownerId: OwnerId, garmentId: string): Promise<PhotoRow[]>;
  find(ownerId: OwnerId, garmentId: string, photoId: string): Promise<PhotoRow | null>;
  /** Locks the garment row; first photo becomes primary. 'full' = already at the limit, 'gone' = garment missing/trashed, 'quota' = the owner's stored bytes would pass `quotaBytes`. */
  add(ownerId: OwnerId, p: NewPhoto, quotaBytes: number): Promise<PhotoRow | 'full' | 'gone' | 'quota'>;
  /** Bytes the owner really stores: shared (duplicated) originals count once, trashed garments' photos count. */
  storedBytes(ownerId: OwnerId): Promise<number>;
  /** Atomic switch; false = unknown photo. */
  setPrimary(ownerId: OwnerId, garmentId: string, photoId: string): Promise<boolean>;
  /** Deletes the row (promoting the next photo when it was primary) and returns it; null = unknown. Never touches storage. */
  remove(ownerId: OwnerId, garmentId: string, photoId: string): Promise<PhotoRow | null>;
  /** Serialised per garment; `previousKey` is the cutout key replaced AT UPDATE TIME (to release). */
  setCutout(ownerId: OwnerId, garmentId: string, photoId: string, c: { status: 'READY' | 'FAILED'; key?: string }): Promise<{ row: PhotoRow; previousKey: string | null } | null>;
  /** Copies every photo row of `source` onto an EMPTY `target` (keys are shared). 'not_empty' | 'gone' on refusal. */
  copyAll(ownerId: OwnerId, sourceGarmentId: string, targetGarmentId: string, newId: () => string, now: Date): Promise<number | 'not_empty' | 'gone'>;
  /** Subset of `keys` that no row references any more. */
  unreferenced(keys: string[]): Promise<string[]>;
}
