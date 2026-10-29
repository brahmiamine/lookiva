import { expect, it } from 'vitest';
import { occurrenceDates, stagesValid, packingList } from '@/modules/planning/domain/planning';
it('generates bounded daily, weekly and monthly dates without overflowing month days', () => {
    expect(occurrenceDates('2026-01-31', { frequency: 'MONTHLY', interval: 1 }, '2026-01-01', '2026-05-31')).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
    expect(occurrenceDates('2026-10-25', { frequency: 'WEEKLY', interval: 1 }, '2026-10-25', '2026-11-08')).toEqual(['2026-10-25', '2026-11-01', '2026-11-08']);
    expect(occurrenceDates('2026-10-25', { frequency: 'DAILY', interval: 2, until: '2026-10-29' }, '2026-10-26', '2026-11-05')).toEqual(['2026-10-27', '2026-10-29']);
});
it('rejects unbounded occurrence requests and invalid dates', () => {
    expect(() => occurrenceDates('2026-01-01', null, '2026-01-01', '2030-01-01')).toThrow();
    expect(() => occurrenceDates('2026-02-30', null, '2026-01-01', '2026-03-01')).toThrow();
});
it('refuses overlapping stages and stages outside a trip', () => {
    expect(stagesValid('2026-10-01', '2026-10-10', [{ from: '2026-10-01', to: '2026-10-04' }, { from: '2026-10-05', to: '2026-10-10' }])).toBe(true);
    expect(stagesValid('2026-10-01', '2026-10-10', [{ from: '2026-10-01', to: '2026-10-05' }, { from: '2026-10-05', to: '2026-10-10' }])).toBe(false);
});
it('deduplicates physical pieces and reports capacity without assigning invented weights', () => {
    expect(packingList(['a', 'a', 'b'], 1)).toEqual({ garmentIds: ['a', 'b'], pieces: 2, overCapacity: true, weightKnown: false });
});
