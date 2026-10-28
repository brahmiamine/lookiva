import { describe, expect, it } from 'vitest';
import { assertIfMatch, etagFor } from '@/platform/http/etag';

describe('etag', () => {
  it('etagFor_is_weak_versioned', () => {
    expect(etagFor(3)).toBe('W/"v3"');
  });

  it('match_passes_for_weak_and_strong_forms', () => {
    expect(() => assertIfMatch('W/"v3"', 3)).not.toThrow();
    expect(() => assertIfMatch('"v3"', 3)).not.toThrow();
  });

  it('mismatch_is_409_VERSION_CONFLICT', () => {
    for (const h of ['W/"v2"', '"v4"', 'garbage', '*', 'W/"v03"', '']) {
      expect(() => assertIfMatch(h, 3), h).toThrowError(
        expect.objectContaining({ code: 'VERSION_CONFLICT', status: 409 }),
      );
    }
  });

  it('null_is_428_IF_MATCH_REQUIRED', () => {
    expect(() => assertIfMatch(null, 3)).toThrowError(
      expect.objectContaining({ code: 'IF_MATCH_REQUIRED', status: 428 }),
    );
  });
});
