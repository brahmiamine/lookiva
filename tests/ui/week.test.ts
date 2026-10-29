import { describe, expect, it } from 'vitest';
import { addDays, isoDay, weekStart } from '@/ui/week';

describe('planning week', () => {
  it('week_starts_on_monday_and_a_sunday_belongs_to_the_week_before', () => {
    expect(isoDay(weekStart(new Date('2026-11-08T12:00:00Z')))).toBe('2026-11-02'); // Sunday -> Monday before
    expect(isoDay(weekStart(new Date('2026-11-02T00:00:00Z')))).toBe('2026-11-02'); // Monday -> itself
    expect(isoDay(addDays(weekStart(new Date('2026-11-02T00:00:00Z')), 7))).toBe('2026-11-09');
  });
});
