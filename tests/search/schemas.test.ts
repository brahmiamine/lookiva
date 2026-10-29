import { expect, it } from 'vitest';
import { draftBody, searchQuery } from '@/modules/wardrobe/api/search-schemas';
it('rejects unsafe search parameters and excessive selections', () => {
  for (const p of [{ ownerId: 'foreign' }, { category: 'invented' }, { q: 'x'.repeat(201) }, { limit: 0 }, { limit: 101 }, { tag: 'invalid' }]) expect(searchQuery.safeParse(p).success).toBe(false);
  expect(searchQuery.parse({ limit: '25' }).limit).toBe(25);
  const id = '00000000-0000-4000-8000-000000000001';
  expect(draftBody.safeParse({ garmentIds: [id, id] }).success).toBe(false);
  expect(draftBody.safeParse({ garmentIds: [] }).success).toBe(false);
});
