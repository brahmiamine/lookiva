import { describe, expect, it } from 'vitest';
import { newId } from '@/platform/http/ids';

describe('newId', () => {
  it('newId_matches_uuid_v7_regex', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('1000_sequential_ids_sort_ascending', () => {
    const ids = Array.from({ length: 1000 }, () => newId());
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(1000);
  });
});
