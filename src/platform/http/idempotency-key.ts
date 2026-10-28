import { createHash } from 'node:crypto';
import { AppError } from './errors';

const KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

/** Reads and validates the `Idempotency-Key` header (also keeps it within the VARCHAR(255) column). */
export function readIdempotencyKey(req: Request): string {
  const key = req.headers.get('Idempotency-Key');
  if (key === null) throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 400, 'Idempotency-Key header is required');
  if (!KEY_RE.test(key)) {
    throw new AppError('IDEMPOTENCY_KEY_INVALID', 400, 'Idempotency-Key must be 8 to 128 characters of A-Z a-z 0-9 _ -');
  }
  return key;
}

/**
 * SHA-256 hex of method, path and canonical body (`path` should include the query string if it changes the meaning
 * of the request; `canonicalBody` comes from `canonicalJson` of the already-parsed body); each part is length-prefixed so ("ab","c") != ("a","bc"). */
export function requestHash(method: string, path: string, canonicalBody: string): string {
  const h = createHash('sha256');
  for (const part of [method.toUpperCase(), path, canonicalBody]) h.update(`${Buffer.byteLength(part)}:${part}`);
  return h.digest('hex');
}

const sortKeys = (v: unknown): unknown => {
  if (v !== null && typeof v === 'object' && typeof (v as { toJSON?: unknown }).toJSON === 'function') {
    return sortKeys((v as { toJSON: () => unknown }).toJSON());
  }
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]));
  }
  return v;
};

/** Deterministic JSON of PARSED JSON input (not of raw text): keys sorted recursively, arrays keep their order. `undefined` -> 'null'. */
export const canonicalJson = (value: unknown): string => JSON.stringify(sortKeys(value)) ?? 'null';
