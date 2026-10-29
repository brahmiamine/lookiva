// Pure photo rules (no platform, no sharp).

export const MAX_PHOTOS_PER_GARMENT = 5;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
/** Decompression-bomb guard: images above this many pixels are refused before decoding (50 MP covers current phones). */
export const MAX_PHOTO_PIXELS = 50_000_000;
export const OPTIMIZED_MAX_SIDE = 1600;
export const THUMB_MAX_SIDE = 400;
export const ROTATIONS = [0, 90, 180, 270] as const;
export const VARIANTS = ['thumb', 'optimized', 'original', 'cutout'] as const;
export type Variant = (typeof VARIANTS)[number];
export type DetectedMime = 'image/jpeg' | 'image/png' | 'image/webp';

const ascii = (b: Uint8Array, from: number, s: string): boolean => [...s].every((c, i) => b[from + i] === c.charCodeAt(0));

/**
 * Real type from the leading bytes; the client-declared MIME is never trusted.
 * 'heic' is recognised only to be refused with a clear message (the pinned sharp build ships no HEVC decoder).
 */
export function detectImage(b: Uint8Array): DetectedMime | 'heic' | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(b, 1, 'PNG') && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return 'image/webp';
  if (ascii(b, 4, 'ftyp') && ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].some((brand) => ascii(b, 8, brand))) return 'heic';
  return null;
}

export type Crop = { left: number; top: number; width: number; height: number };

/** Crop is expressed on the image AFTER EXIF orientation and the requested rotation. */
export function cropError(c: Crop, w: number, h: number): string | null {
  if (![c.left, c.top, c.width, c.height].every(Number.isInteger)) return 'crop values must be integers';
  if (c.left < 0 || c.top < 0 || c.width < 1 || c.height < 1) return 'crop must have a positive size inside the image';
  if (c.left + c.width > w || c.top + c.height > h) return `crop exceeds the ${w}x${h} image`;
  return null;
}

/** Storage keys; the owner id in the path keeps objects of different owners apart. */
export const photoKeys = (ownerId: string, photoId: string) => ({
  original: `photos/${ownerId}/${photoId}/original`,
  optimized: `photos/${ownerId}/${photoId}/optimized.webp`,
  thumb: `photos/${ownerId}/${photoId}/thumb.webp`,
});
