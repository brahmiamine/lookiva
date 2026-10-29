import { expect, it } from 'vitest';
import { eventBody, tripBody } from '@/modules/planning/api/schemas';
it('validates real dates, timezones, recurrence ends and nonoverlapping trip stages', () => {
    const e = { title: 'Sport', date: '2026-10-29', timezone: 'Europe/Paris', type: 'SPORT' };
    expect(eventBody.safeParse(e).success).toBe(true);
    for (const patch of [{ date: '2026-02-30' }, { timezone: 'Mars' }, { recurrence: { frequency: 'DAILY', interval: 0 } }, { recurrence: { frequency: 'DAILY', interval: 1, until: '2026-01-01' } }])
        expect(eventBody.safeParse({ ...e, ...patch }).success).toBe(false);
    expect(tripBody.safeParse({ title: 'Voyage', from: '2026-10-29', to: '2026-10-28' }).success).toBe(false);
});
it('returns validation errors instead of throwing on malformed trip dates', () => {
    expect(tripBody.safeParse({ title: 'Trip', from: 'invalid', to: '2026-11-01' }).success).toBe(false);
    expect(tripBody.safeParse({ title: 'Trip', from: '2026-11-01', to: '2026-11-10', stages: [{ city: 'Paris', timezone: 'Europe/Paris', from: '2026-02-30', to: '2026-11-02' }] }).success).toBe(false);
});
