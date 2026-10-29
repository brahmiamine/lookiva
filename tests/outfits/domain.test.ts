import { describe, expect, it } from 'vitest';
import { isTimezone, localParts, overlap, planningGaps } from '@/modules/outfits/domain/outfit';
import { missingRoles } from '@/modules/outfits/domain/roles';

const slot = (start: string, end: string | null, localDate = start.slice(0, 10)) => ({ startsAt: new Date(start), endsAt: end ? new Date(end) : null, localDate });

describe('missingRoles', () => {
  it.each([
    [['TOP', 'BOTTOM', 'SHOES'], []],
    [['ONE_PIECE', 'SHOES'], []],
    [['TOP'], ['BOTTOM', 'SHOES']],
    [[], ['TOP', 'BOTTOM', 'SHOES']],
    [['ONE_PIECE'], ['SHOES']],
  ] as const)('%j misses %j', (present, missing) => expect(missingRoles([...present])).toEqual(missing));
});

describe('localParts', () => {
  it('derives the wall clock of the zone (winter and summer offsets)', () => {
    expect(localParts(new Date('2026-11-02T23:30:00Z'), 'Europe/Paris')).toEqual({ localDate: '2026-11-03', localTime: '00:30' });
    expect(localParts(new Date('2026-07-01T22:30:00Z'), 'Europe/Paris')).toEqual({ localDate: '2026-07-02', localTime: '00:30' });
    expect(localParts(new Date('2026-07-01T00:05:00Z'), 'America/New_York')).toEqual({ localDate: '2026-06-30', localTime: '20:05' });
  });
  it('validates IANA zones', () => {
    expect(isTimezone('Europe/Paris')).toBe(true);
    expect(isTimezone('Mars/Base')).toBe(false);
  });
});

describe('planningGaps', () => {
  it('names what a PLANNED outfit still needs', () => {
    expect(planningGaps({ startsAt: null, timezone: null, occasion: null })).toEqual(['startsAt', 'occasion']);
    expect(planningGaps({ startsAt: new Date(), timezone: 'UTC', occasion: 'Work' })).toEqual([]);
  });
});

describe('overlap: certain only when proven, otherwise a soft hint', () => {
  it('both ends known and intersecting = CERTAIN; touching or apart = none', () => {
    expect(overlap(slot('2026-11-03T09:00Z', '2026-11-03T12:00Z'), slot('2026-11-03T11:00Z', '2026-11-03T14:00Z'))).toBe('CERTAIN');
    expect(overlap(slot('2026-11-03T09:00Z', '2026-11-03T12:00Z'), slot('2026-11-03T12:00Z', '2026-11-03T14:00Z'))).toBeNull();
    expect(overlap(slot('2026-11-03T09:00Z', '2026-11-03T10:00Z'), slot('2026-11-03T18:00Z', '2026-11-03T20:00Z'))).toBeNull();
  });
  it('same start = CERTAIN even without ends', () => {
    expect(overlap(slot('2026-11-03T09:00Z', null), slot('2026-11-03T09:00Z', null))).toBe('CERTAIN');
  });
  it('no ends, same day, different start = POSSIBLE; other day = none', () => {
    expect(overlap(slot('2026-11-03T09:00Z', null), slot('2026-11-03T19:00Z', null))).toBe('POSSIBLE');
    expect(overlap(slot('2026-11-03T09:00Z', null), slot('2026-11-04T09:00Z', null))).toBeNull();
  });
  it('one end missing: a start inside the known interval is CERTAIN, an open slot that started earlier is POSSIBLE, one that starts after the end is none', () => {
    const closed = slot('2026-11-03T09:00Z', '2026-11-03T12:00Z');
    expect(overlap(closed, slot('2026-11-03T10:00Z', null))).toBe('CERTAIN');
    expect(overlap(slot('2026-11-03T10:00Z', null), closed)).toBe('CERTAIN');
    expect(overlap(closed, slot('2026-11-03T08:00Z', null))).toBe('POSSIBLE');
    expect(overlap(closed, slot('2026-11-03T13:00Z', null))).toBeNull();
  });
});
