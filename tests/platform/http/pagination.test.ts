import { describe, expect, it } from 'vitest';
import { AppError } from '@/platform/http/errors';
import { decodeCursor, encodeCursor, parsePage } from '@/platform/http/pagination';

const b64 = (s: string) => Buffer.from(s).toString('base64url');

describe('cursor', () => {
  it('roundtrip_cursor', () => {
    const c = encodeCursor({ id: 'abc-123' });
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(c)).toEqual({ id: 'abc-123' });
  });

  it('tampered_or_non_base64_cursor_is_400_INVALID_CURSOR', () => {
    const bad = [
      '!!!not base64!!!',
      b64('not json'),
      b64('{"x":1}'),
      b64('{"id":""}'),
      b64('{"id":42}'),
      b64(JSON.stringify({ id: 'a'.repeat(65) })),
      b64('null'),
      '',
    ];
    for (const s of bad) {
      let err: unknown;
      try {
        decodeCursor(s);
      } catch (e) {
        err = e;
      }
      expect(err, s).toBeInstanceOf(AppError);
      expect(err).toMatchObject({ code: 'INVALID_CURSOR', status: 400 });
    }
  });
});

describe('parsePage', () => {
  it('defaults_to_20_without_cursor', () => {
    expect(parsePage(new URLSearchParams())).toEqual({ limit: 20 });
  });

  it('decodes_cursor', () => {
    const p = new URLSearchParams({ limit: '5', cursor: encodeCursor({ id: 'z' }) });
    expect(parsePage(p)).toEqual({ limit: 5, cursor: { id: 'z' } });
  });

  it('limit_above_100_is_clamped', () => {
    expect(parsePage(new URLSearchParams({ limit: '500' })).limit).toBe(100);
  });

  it('limit_zero_or_non_integer_is_400', () => {
    for (const l of ['0', '-3', '1.5', 'abc', '']) {
      expect(() => parsePage(new URLSearchParams({ limit: l })), l).toThrowError(
        expect.objectContaining({ code: 'VALIDATION_ERROR', status: 400 }),
      );
    }
  });

  it('bad_cursor_param_is_400_INVALID_CURSOR', () => {
    expect(() => parsePage(new URLSearchParams({ cursor: 'zzz' }))).toThrowError(
      expect.objectContaining({ code: 'INVALID_CURSOR' }),
    );
  });
});
