import { z } from 'zod';
import { AppError } from './errors';

const cursorSchema = z.object({ id: z.string().min(1).max(64) });
export type Cursor = z.infer<typeof cursorSchema>;

export const encodeCursor = (v: Cursor): string => Buffer.from(JSON.stringify({ id: v.id })).toString('base64url');

export function decodeCursor(s: string): Cursor {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(s, 'base64url').toString('utf8')));
  } catch {
    throw new AppError('INVALID_CURSOR', 400, 'Invalid cursor');
  }
}

const limitSchema = z.coerce.number().int().min(1);

export function parsePage(p: URLSearchParams): { limit: number; cursor?: Cursor } {
  const raw = p.get('limit');
  let limit = 20;
  if (raw !== null) {
    // Number('') is 0, so empty is rejected by min(1); '1.5'/'abc' fail int()/NaN.
    const r = limitSchema.safeParse(raw);
    if (!r.success) throw new AppError('VALIDATION_ERROR', 400, 'Validation failed', [{ path: 'limit', message: 'limit must be a positive integer' }]);
    limit = Math.min(r.data, 100);
  }
  const cursor = p.get('cursor');
  return cursor === null ? { limit } : { limit, cursor: decodeCursor(cursor) };
}
