import { describe, expect, it } from 'vitest';
import { createOutfitService, type OutfitStore } from '@/modules/wardrobe/application/outfit-service';

const owner = 'b3f1c2d4-0000-4000-8000-000000000001' as never;

describe('laundry step', () => {
  it('nothing_is_ticked_by_default_and_only_listed_garments_are_sent', async () => {
    const sent: string[][] = [];
    const store = { markToWash: async (_o: unknown, _w: string, ids: string[]) => (sent.push(ids), { kind: 'OK' as const, changedIds: ids, unchangedIds: [] }) } as unknown as OutfitStore;
    const svc = createOutfitService({ outfits: store, now: () => new Date(0), newId: () => 'x' });
    await expect(svc.markToWash(owner, 'w', [])).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(sent).toHaveLength(0);
    await svc.markToWash(owner, 'w', ['g1']);
    expect(sent).toEqual([['g1']]);
  });
});
