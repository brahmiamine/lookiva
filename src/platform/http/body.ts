import type { z } from 'zod';
import { AppError } from './errors';

/** Largest JSON body any route accepts (identity bodies are well under 2 KiB). */
export const MAX_JSON_BYTES = 16 * 1024;

const tooLarge = () => new AppError('PAYLOAD_TOO_LARGE', 413, `Request body exceeds ${MAX_JSON_BYTES} bytes`);
const invalid = () => new AppError('INVALID_JSON', 400, 'Malformed JSON body');

/** Reads at most MAX_JSON_BYTES from the stream, whatever Content-Length claims; stops reading as soon as it is crossed. */
async function readCapped(req: Request): Promise<string> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) throw tooLarge();
  if (!req.body) throw invalid();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_JSON_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Reads and validates a JSON request body. Every module must use this instead of `req.json()`:
 * the parser's SyntaxError message quotes a fragment of the body (possibly a password), so it is
 * never used, logged or attached as `cause`. Bodies over MAX_JSON_BYTES are 413 PAYLOAD_TOO_LARGE (content never
 * echoed). A schema violation throws a ZodError (-> 400 VALIDATION_ERROR in withApi).
 */
export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const text = await readCapped(req);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw invalid();
  }
  return schema.parse(raw);
}
