import { describe, expect, it } from 'vitest';
import { asOwnerId } from '@/platform/kernel';
import { createSearchService } from '@/modules/wardrobe/application/search-service';
import type { SearchGarment } from '@/modules/wardrobe/domain/search';
const owner = asOwnerId('00000000-0000-4000-8000-000000000001');
const other = asOwnerId('00000000-0000-4000-8000-000000000002');
const row = (id: string): SearchGarment => ({ id, nickname: 'Mes baskets', categoryCode: 'FOOTWEAR', subtypeCode: 'SNEAKERS', customLabel: null, primaryColorCode: 'BLACK', extraColorCodes: [], status: 'AVAILABLE', seasons: [], styles: [], notes: null, purchaseStore: null, tags: [], collections: [], sets: [], createdAt: '2026-10-01T00:00:00Z' });
const service = () => createSearchService({ list: async (id) => id === owner ? ['a', 'b', 'c'].map(row) : [] });

describe('search service', () => {
  it('paginates ranked results without duplicates', async () => {
    const s = service();
    const a = await s.search(owner, { q: 'baskets', limit: 2 });
    expect(a.items.map((x) => x.id)).toEqual(['c', 'b']);
    expect(a.mode).toBe('text');
    const b = await s.search(owner, { q: 'baskets', limit: 2, cursor: a.nextCursor });
    expect(b.items.map((x) => x.id)).toEqual(['a']);
    expect(b.nextCursor).toBeUndefined();
  });
  it('rejects a cursor reused for another query or owner and malformed cursors', async () => {
    const s = service();
    const first = await s.search(owner, { q: 'basket', limit: 1 });
    await expect(s.search(owner, { q: 'shirt', limit: 1, cursor: first.nextCursor })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
    await expect(s.search(other, { q: 'basket', limit: 1, cursor: first.nextCursor })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
    await expect(s.search(owner, { cursor: 'garbage' })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
  });
  it('prepares only requested own garments without writing an outfit', async () => {
    expect(await service().draft(owner, ['a', 'c'])).toEqual({ garmentIds: ['a', 'c'], unavailableIds: [], saved: false });
    await expect(service().draft(other, ['a'])).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service().draft(owner, ['a', 'foreign'])).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('reports unavailability instead of silently changing a selected item', async () => {
    const s = createSearchService({ list: async () => [{ ...row('a'), status: 'LENT' }] });
    expect(await s.draft(owner, ['a'])).toMatchObject({ unavailableIds: ['a'], saved: false });
  });
});

it('rejects a continuation when the anchor was removed from the current sources', async () => {
  let rows = ['a', 'b'].map(row);
  const s = createSearchService({ list: async () => rows });
  const first = await s.search(owner, { limit: 1 });
  rows = [row('a')];
  await expect(s.search(owner, { limit: 1, cursor: first.nextCursor })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
});
