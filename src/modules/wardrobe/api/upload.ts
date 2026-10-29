import { z } from 'zod';
import { AppError } from '@/platform/http/errors';
import { MAX_PHOTO_BYTES, type Crop } from '../domain/photo';

/** Multipart framing allowance on top of the file itself. */
const OVERHEAD = 64 * 1024;
const tooLarge = () => new AppError('PAYLOAD_TOO_LARGE', 413, `Photo exceeds ${MAX_PHOTO_BYTES} bytes`);

export const cropField = z.string().transform((s, ctx) => {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    ctx.addIssue({ code: 'custom', message: 'crop must be JSON {"left","top","width","height"}' });
    return z.NEVER;
  }
}).pipe(z.strictObject({ left: z.number().int(), top: z.number().int(), width: z.number().int(), height: z.number().int() }));
export const rotateField = z.enum(['0', '90', '180', '270']).transform(Number);

/**
 * Reads at most MAX_PHOTO_BYTES + OVERHEAD from the stream (whatever Content-Length claims) and stops pulling as soon as
 * the cap is crossed, so an oversized or endless upload is never buffered. Fields: `file`, optional `rotate`, `crop`.
 */
export async function readPhotoUpload(req: Request): Promise<{ bytes: Uint8Array; declaredMime: string; rotate: number; crop?: Crop }> {
  const type = req.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data;\s*boundary=/i.test(type)) throw new AppError('UNSUPPORTED_MEDIA_TYPE', 415, 'Send multipart/form-data with a "file" part');
  const cap = MAX_PHOTO_BYTES + OVERHEAD;
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > cap) throw tooLarge();
  if (!req.body) throw new AppError('VALIDATION_ERROR', 400, 'Validation failed', [{ path: 'file', message: 'file is required' }]);

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }

  let form: FormData;
  try {
    form = await new Request('http://local/', { method: 'POST', headers: { 'content-type': type }, body: Buffer.concat(chunks) }).formData();
  } catch {
    throw new AppError('VALIDATION_ERROR', 400, 'Validation failed', [{ path: 'file', message: 'malformed multipart body' }]);
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw new AppError('VALIDATION_ERROR', 400, 'Validation failed', [{ path: 'file', message: 'file is required' }]);
  if (file.size > MAX_PHOTO_BYTES) throw tooLarge();
  const opts = z.object({ rotate: rotateField.optional(), crop: cropField.optional() }).parse({
    rotate: form.get('rotate') ?? undefined,
    crop: form.get('crop') ?? undefined,
  });
  return { bytes: new Uint8Array(await file.arrayBuffer()), declaredMime: file.type, rotate: opts.rotate ?? 0, crop: opts.crop };
}
