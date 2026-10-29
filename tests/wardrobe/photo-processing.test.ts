import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { IMAGE_SLOTS, imageWork } from '@/platform/concurrency';
import { AppError } from '@/platform/http/errors';
import { cropError, detectImage } from '@/modules/wardrobe/domain/photo';
import { createSharpProcessor } from '@/modules/wardrobe/infrastructure/sharp-processor';
import { heic, jpeg, png, pngBomb, webp } from './fixtures';

const proc = createSharpProcessor();
const run = (b: Uint8Array, mime: string, o: { rotate?: number; crop?: { left: number; top: number; width: number; height: number } } = {}) => proc.process(b, mime, { rotate: o.rotate ?? 0, crop: o.crop });
const rejects = async (p: Promise<unknown>, status: number, code: string) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(AppError);
  expect(e).toMatchObject({ status, code });
};

describe('detectImage', () => {
  it('reads_the_magic_bytes_not_the_name', async () => {
    expect(detectImage(await jpeg())).toBe('image/jpeg');
    expect(detectImage(await png())).toBe('image/png');
    expect(detectImage(await webp())).toBe('image/webp');
    expect(detectImage(heic())).toBe('heic');
    expect(detectImage(Buffer.from('hello world, definitely not an image'))).toBeNull();
    expect(detectImage(new Uint8Array())).toBeNull();
  });
  it('crop_must_stay_inside_the_image', () => {
    expect(cropError({ left: 0, top: 0, width: 10, height: 10 }, 10, 10)).toBeNull();
    expect(cropError({ left: 1, top: 0, width: 10, height: 10 }, 10, 10)).not.toBeNull();
    expect(cropError({ left: -1, top: 0, width: 5, height: 5 }, 10, 10)).not.toBeNull();
    expect(cropError({ left: 0, top: 0, width: 0, height: 5 }, 10, 10)).not.toBeNull();
  });
});

describe('image processor', () => {
  it('accepts_jpeg_png_webp_and_makes_optimized_and_thumb_webp', async () => {
    for (const [b, mime] of [[await jpeg(3200, 1000), 'image/jpeg'], [await png(), 'image/png'], [await webp(), 'image/webp']] as const) {
      const r = await run(b, mime);
      expect(r.mime).toBe(mime);
      expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect((await sharp(r.optimized).metadata()).format).toBe('webp');
      expect((await sharp(r.thumb).metadata()).format).toBe('webp');
    }
    const big = await run(await jpeg(3200, 1000), 'image/jpeg');
    expect(big).toMatchObject({ width: 1600, height: 500 });
    expect(await sharp(big.thumb).metadata()).toMatchObject({ width: 400, height: 125 });
    const small = await run(await png(30, 30), 'image/png');
    expect(small.width).toBe(30); // never enlarged
  });

  it('strips_exif_and_gps_from_every_derivative', async () => {
    const src = await jpeg(60, 40, { gps: true });
    expect((await sharp(src).metadata()).exif).toBeDefined(); // fixture really carries EXIF
    expect(src.includes(Buffer.from('TestCam'))).toBe(true);
    const r = await run(src, 'image/jpeg');
    for (const d of [r.original, r.optimized, r.thumb]) {
      const m = await sharp(d).metadata();
      expect(m.exif).toBeUndefined();
      expect(m.icc).toBeUndefined();
      expect(Buffer.from(d).includes(Buffer.from('TestCam'))).toBe(false);
      expect(Buffer.from(d).includes(Buffer.from('Exif'))).toBe(false);
    }
  });

  it('the_original_is_metadata_free_same_format_and_oriented', async () => {
    const src = await jpeg(60, 40, { gps: true, orientation: 6 });
    const r = await createSharpProcessor().process(src, 'image/jpeg', { rotate: 0 });
    const m = await sharp(r.original).metadata();
    expect(m).toMatchObject({ format: 'jpeg', width: 40, height: 60 });
    expect(m.exif).toBeUndefined();
    expect(Buffer.from(r.original).includes(Buffer.from('TestCam'))).toBe(false);
    for (const [bytes, format] of [[await png(), 'png'], [await webp(), 'webp']] as const) {
      expect((await sharp((await createSharpProcessor().process(bytes, `image/${format}`, { rotate: 0 })).original).metadata()).format).toBe(format);
    }
  });

  it('image_work_never_exceeds_the_process_wide_semaphore', async () => {
    const before = imageWork.stats().peak;
    const src = await jpeg(400, 300);
    const p = createSharpProcessor();
    await Promise.all(Array.from({ length: 8 }, () => p.process(src, 'image/jpeg', { rotate: 0 })));
    const { peak, active, waiting } = imageWork.stats();
    expect(peak).toBeLessThanOrEqual(IMAGE_SLOTS);
    expect(peak).toBeGreaterThanOrEqual(Math.max(1, before));
    expect([active, waiting]).toEqual([0, 0]);
  });

  it('applies_exif_orientation', async () => {
    const r = await run(await jpeg(60, 40, { orientation: 6 }), 'image/jpeg'); // 6 = rotate 90 CW
    expect(r).toMatchObject({ width: 40, height: 60 });
    expect((await sharp(r.optimized).metadata()).orientation).toBeUndefined();
    const { data } = await sharp(r.optimized).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(200); // red half was the left one: after a 90 CW turn it is on top
    expect(data[data.length - 3]).toBeLessThan(60);
  });

  it('rotates_and_crops_after_orientation', async () => {
    expect(await run(await jpeg(60, 40), 'image/jpeg', { rotate: 90 })).toMatchObject({ width: 40, height: 60 });
    expect(await run(await jpeg(60, 40), 'image/jpeg', { rotate: 180 })).toMatchObject({ width: 60, height: 40 });
    expect(await run(await jpeg(60, 40), 'image/jpeg', { crop: { left: 10, top: 5, width: 20, height: 10 } })).toMatchObject({ width: 20, height: 10 });
    const both = await run(await jpeg(60, 40), 'image/jpeg', { rotate: 90, crop: { left: 0, top: 0, width: 40, height: 30 } });
    expect(both).toMatchObject({ width: 40, height: 30 });
    await rejects(run(await jpeg(60, 40), 'image/jpeg', { crop: { left: 50, top: 0, width: 20, height: 10 } }), 400, 'VALIDATION_ERROR');
    await rejects(run(await jpeg(60, 40), 'image/jpeg', { rotate: 90, crop: { left: 0, top: 0, width: 60, height: 40 } }), 400, 'VALIDATION_ERROR');
  });

  it('rejects_faked_mime_unknown_formats_heic_and_text', async () => {
    await rejects(run(await png(), 'image/jpeg'), 415, 'MIME_MISMATCH');
    await rejects(run(await jpeg(), 'image/png'), 415, 'MIME_MISMATCH');
    await rejects(run(Buffer.from('just text'), 'image/jpeg'), 415, 'UNSUPPORTED_IMAGE_FORMAT');
    await rejects(run(heic(), 'image/heic'), 415, 'UNSUPPORTED_IMAGE_FORMAT');
    await rejects(run(await jpeg(), 'application/octet-stream'), 415, 'MIME_MISMATCH');
  });

  it('rejects_pixel_bombs_and_truncated_files_before_decoding', async () => {
    await rejects(run(pngBomb(), 'image/png'), 422, 'INVALID_IMAGE'); // header says 3.6 GP: libvips refuses at metadata time
    const j = await jpeg(200, 200);
    await rejects(run(j.subarray(0, 100), 'image/jpeg'), 422, 'INVALID_IMAGE');
  });
});
