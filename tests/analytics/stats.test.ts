import { expect, it } from 'vitest';
import { wardrobeStats } from '@/modules/analytics/domain/stats';
const g = (id: string, price: number | null = 100, currency: string | null = 'EUR', createdAt = '2026-01-01T00:00:00Z') => ({ id, price, currency, createdAt, category: 'TOPS', status: 'AVAILABLE' });
it('uses confirmed wears, separates currencies, and never invents a cost for absent prices or zero wears', () => {
    const s = wardrobeStats([g('a'), g('b', null), g('c', 40, 'TND'), g('d', 0)], Array.from({ length: 10 }, (_, n) => ({ garmentId: 'a', at: `2026-10-${String(n + 1).padStart(2, '0')}T10:00:00Z` })), { from: '2026-10-01', to: '2026-10-29', now: new Date('2026-10-29T00:00:00Z'), forgottenDays: 90 });
    expect(s.items.find(x => x.id === 'a')).toMatchObject({ wears: 10, costPerWear: 10, forgotten: false });
    expect(s.items.find(x => x.id === 'b')?.costPerWear).toBeNull();
    expect(s.items.find(x => x.id === 'd')?.costPerWear).toBeNull();
    expect(s.spending).toEqual([{ currency: 'EUR', amount: 100 }, { currency: 'TND', amount: 40 }]);
    expect(s.used).toBe(1);
    expect(s.eligible).toBe(4);
});
it('protects new pieces, applies inclusive date windows and ignores future wears', () => {
    const s = wardrobeStats([g('new', 5, 'EUR', '2026-10-28T00:00:00Z'), g('old')], [{ garmentId: 'old', at: '2026-10-29T23:59:00Z' }, { garmentId: 'old', at: '2026-11-01T00:00:00Z' }], { from: '2026-10-29', to: '2026-10-29', now: new Date('2026-10-30T00:00:00Z'), forgottenDays: 90 });
    expect(s.items.find(x => x.id === 'new')?.forgotten).toBe(false);
    expect(s.items.find(x => x.id === 'old')?.wears).toBe(1);
});
it('uses lifetime wears for cost even when the reporting window contains no wears', () => {
    const s = wardrobeStats([g('a')], [{ garmentId: 'a', at: '2026-01-01T12:00:00Z' }], { from: '2026-10-01', to: '2026-10-29', now: new Date('2026-10-29'), forgottenDays: 90 });
    expect(s.items[0]).toMatchObject({ wears: 0, totalWears: 1, costPerWear: 100, forgotten: true });
});
it('includes inventory and confirmed wears at exactly the reporting clock instant', () => {
    const now = new Date('2026-10-29T12:00:00Z');
    const s = wardrobeStats([g('a', 100, 'EUR', now.toISOString())], [{ garmentId: 'a', at: now.toISOString() }], { from: '2026-10-29', to: '2026-10-29', now, forgottenDays: 90 });
    expect(s.eligible).toBe(1);
    expect(s.items[0]).toMatchObject({ totalWears: 1, wears: 1, costPerWear: 100 });
});
