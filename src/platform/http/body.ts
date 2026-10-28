import type { z } from 'zod';
import { AppError } from './errors';

/**
 * Reads and validates a JSON request body. Every module must use this instead of `req.json()`:
 * the parser's SyntaxError message quotes a fragment of the body (possibly a password), so it is
 * never used, logged or attached as `cause`. A schema violation throws a ZodError (-> 400 VALIDATION_ERROR in withApi).
 */
export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(await req.text());
  } catch {
    throw new AppError('INVALID_JSON', 400, 'Malformed JSON body');
  }
  return schema.parse(raw);
}
