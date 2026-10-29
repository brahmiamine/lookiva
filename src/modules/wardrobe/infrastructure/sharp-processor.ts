import { createHash } from 'node:crypto';
import sharp, { type SharpOptions } from 'sharp';
import { imageWork } from '@/platform/concurrency';
import { AppError } from '@/platform/http/errors';
import { cropError, detectImage, MAX_PHOTO_PIXELS, OPTIMIZED_MAX_SIDE, THUMB_MAX_SIDE, type Crop, type DetectedMime } from '../domain/photo';
import type { ImageProcessor } from '../application/photo-ports';

// Bounded libvips threads/cache: one 50 MP decode is already a few hundred MB, so keep the footprint predictable.
sharp.concurrency(2);
sharp.cache({ memory: 64, items: 20, files: 0 });

const bad = (status: number, code: string, message: string) => new AppError(code, status, message);

/** Same format, no metadata. EXIF orientation is applied to the pixels first, so dropping the tag changes nothing visually. */
const cleanOriginal = (input: Uint8Array, real: DetectedMime, opts: SharpOptions) => {
  const p = sharp(input, opts).autoOrient();
  return (real === 'image/jpeg' ? p.jpeg({ quality: 95 }) : real === 'image/png' ? p.png() : p.webp({ quality: 95 })).toBuffer();
};

async function run(input: Uint8Array, declaredMime: string, { rotate, crop }: { rotate: number; crop?: Crop }) {
  const real = detectImage(input);
  if (real === 'heic') throw bad(415, 'UNSUPPORTED_IMAGE_FORMAT', 'HEIC/HEIF is not supported yet: export the photo as JPEG, PNG or WebP');
  if (!real) throw bad(415, 'UNSUPPORTED_IMAGE_FORMAT', 'File is not a JPEG, PNG or WebP image');
  if (declaredMime !== real) throw bad(415, 'MIME_MISMATCH', 'Declared content type does not match the file content');

  // limitInputPixels makes libvips refuse a decompression bomb before allocating the pixels.
  const opts = { limitInputPixels: MAX_PHOTO_PIXELS, failOn: 'error' } as const;
  let w: number;
  let h: number;
  try {
    const m = await sharp(input, opts).metadata();
    [w, h] = (m.orientation ?? 1) >= 5 ? [m.height, m.width] : [m.width, m.height];
  } catch {
    throw bad(422, 'INVALID_IMAGE', 'Image is corrupt or exceeds the pixel limit');
  }
  if (rotate % 180 === 90) [w, h] = [h, w];
  if (crop) {
    const err = cropError(crop, w, h);
    if (err) throw new AppError('VALIDATION_ERROR', 400, 'Validation failed', [{ path: 'crop', message: err }]);
  }

  // EXIF orientation is applied, then the requested rotation and crop; nothing calls withMetadata(), so every
  // output (original included) is written WITHOUT EXIF/GPS/ICC.
  const base = () => {
    let p = sharp(input, opts).autoOrient();
    if (rotate) p = p.rotate(rotate);
    if (crop) p = p.extract(crop);
    return p;
  };
  const derive = (side: number, quality: number) =>
    base().resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer({ resolveWithObject: true });
  try {
    const [opt, thumb, original] = await Promise.all([derive(OPTIMIZED_MAX_SIDE, 82), derive(THUMB_MAX_SIDE, 75), cleanOriginal(input, real, opts)]);
    return {
      mime: real,
      sha256: createHash('sha256').update(input).digest('hex'),
      width: opt.info.width,
      height: opt.info.height,
      original,
      optimized: opt.data,
      thumb: thumb.data,
    };
  } catch {
    throw bad(422, 'INVALID_IMAGE', 'Image could not be decoded');
  }
}

export function createSharpProcessor(): ImageProcessor {
  // At most IMAGE_SLOTS images are decoded at once, process-wide; the others wait.
  return { process: (input, declaredMime, o) => imageWork.run(() => run(input, declaredMime, o)) };
}
