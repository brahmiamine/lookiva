import { describe, expect, it } from 'vitest';
import { AppError } from '@/platform/http/errors';
import { canonicalJson, readIdempotencyKey, requestHash } from '@/platform/http/idempotency-key';

const reqWith = (key?: string) =>
  new Request('http://x/api/v1/things', { method: 'POST', headers: key === undefined ? {} : { 'Idempotency-Key': key } });

const failure = (fn: () => unknown): AppError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return e as AppError;
  }
  throw new Error('expected a throw');
};

describe('readIdempotencyKey', () => {
  it('key_missing_is_400_required', () => {
    expect(failure(() => readIdempotencyKey(reqWith()))).toMatchObject({ status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' });
  });

  it('key_too_short_or_long_or_bad_chars_is_400_invalid', () => {
    for (const bad of ['', 'short77', 'a'.repeat(129), 'has space1', 'bad!chars1', 'sl/ash-12', 'é'.repeat(8)]) {
      expect(failure(() => readIdempotencyKey(reqWith(bad))), bad).toMatchObject({
        status: 400,
        code: 'IDEMPOTENCY_KEY_INVALID',
      });
    }
  });

  it('valid_key_is_returned', () => {
    for (const ok of ['abcdefgh', 'A_b-C_d-1234', 'k'.repeat(128), '0190c1e2-7b1a-7c3d-8e4f-123456789abc']) {
      expect(readIdempotencyKey(reqWith(ok))).toBe(ok);
    }
  });
});

describe('requestHash', () => {
  it('requestHash_is_stable_and_length_delimited', () => {
    const h = requestHash('POST', '/api/v1/things', '{"a":1}');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(requestHash('POST', '/api/v1/things', '{"a":1}')).toBe(h);
    expect(requestHash('PUT', '/api/v1/things', '{"a":1}')).not.toBe(h);
    expect(requestHash('POST', '/api/v1/other', '{"a":1}')).not.toBe(h);
    expect(requestHash('POST', '/api/v1/things', '{"a":2}')).not.toBe(h);
    // concatenation ambiguity: ("ab","c") must differ from ("a","bc")
    expect(requestHash('POST', 'ab', 'c')).not.toBe(requestHash('POST', 'a', 'bc'));
    expect(requestHash('POST', '', 'abc')).not.toBe(requestHash('POST', 'abc', ''));
  });
});

describe('canonicalJson', () => {
  it('canonicalJson_sorts_keys_recursively', () => {
    const a = canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } });
    const b = canonicalJson({ a: { c: null, d: [3, { x: 2, y: 1 }] }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}');
    // arrays keep their order, dates serialize through toJSON
    expect(canonicalJson([2, 1])).toBe('[2,1]');
    expect(canonicalJson({ at: new Date('2026-01-01T00:00:00.000Z') })).toBe('{"at":"2026-01-01T00:00:00.000Z"}');
  });
});
