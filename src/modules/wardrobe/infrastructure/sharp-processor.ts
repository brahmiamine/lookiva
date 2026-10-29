import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { AppError } from '@/platform/http/errors';
import { cropError, detectImage, MAX_PHOTO_PIXELS, OPTIMIZED_MAX_SIDE, THUMB_MAX_SIDE } from '../domain/photo';
import type { ImageProcessor } from '../application/photo-ports';

const bad = (status: number, code: string, message: string) => new AppError(code, status, message);

export function createSharpProcessor(): ImageProcessor {
  return {
    async process(input, declaredMime, { rotate, crop }) {
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
      // derivative is written WITHOUT EXIF/GPS/ICC. Only the private original keeps its bytes untouched.
      const base = () => {
        let p = sharp(input, opts).autoOrient();
        if (rotate) p = p.rotate(rotate);
        if (crop) p = p.extract(crop);
        return p;
      };
      const derive = (side: number, quality: number) =>
        base().resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer({ resolveWithObject: true });
      try {
        const [opt, thumb] = await Promise.all([derive(OPTIMIZED_MAX_SIDE, 82), derive(THUMB_MAX_SIDE, 75)]);
        return {
          mime: real,
          sha256: createHash('sha256').update(input).digest('hex'),
          width: opt.info.width,
          height: opt.info.height,
          optimized: opt.data,
          thumb: thumb.data,
        };
      } catch {
        throw bad(422, 'INVALID_IMAGE', 'Image could not be decoded');
      }
    },
  };
}
