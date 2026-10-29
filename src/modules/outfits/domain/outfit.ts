export const OUTFIT_STATUSES = ['DRAFT', 'PLANNED', 'WORN', 'CANCELLED'] as const;
export type OutfitStatus = (typeof OUTFIT_STATUSES)[number];
export const WEAR_STATUSES = ['ACTIVE', 'INVALIDATED'] as const;
export type WearStatus = (typeof WEAR_STATUSES)[number];

/** Only these can be edited, planned or confirmed; WORN is history, CANCELLED is closed. */
export const isEditable = (s: OutfitStatus): boolean => s === 'DRAFT' || s === 'PLANNED';

export const isTimezone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz.length <= 64;
  } catch {
    return false;
  }
};

/** Wall-clock date (YYYY-MM-DD) and time (HH:mm) of a UTC instant in an IANA zone. */
export function localParts(at: Date, timeZone: string): { localDate: string; localTime: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return { localDate: `${p.year}-${p.month}-${p.day}`, localTime: `${p.hour}:${p.minute}` };
}

/** A PLANNED outfit needs a start (with its zone) and an occasion. */
export const planningGaps = (o: { startsAt: Date | null; timezone: string | null; occasion: string | null }): string[] =>
  [...(o.startsAt && o.timezone ? [] : ['startsAt']), ...(o.occasion ? [] : ['occasion'])];

export type Slot = { startsAt: Date; endsAt: Date | null; localDate: string };
/**
 * CERTAIN only when the known information proves the overlap: both intervals known and intersecting, or one start inside the
 * other's known interval, or identical starts. POSSIBLE (soft hint) when an end is missing and both start the same local day.
 */
export function overlap(a: Slot, b: Slot): 'CERTAIN' | 'POSSIBLE' | null {
  const [as, bs] = [a.startsAt.getTime(), b.startsAt.getTime()];
  if (as === bs) return 'CERTAIN';
  if (a.endsAt && b.endsAt) return as < b.endsAt.getTime() && bs < a.endsAt.getTime() ? 'CERTAIN' : null;
  const sameDay = a.localDate === b.localDate;
  if (!a.endsAt && !b.endsAt) return sameDay ? 'POSSIBLE' : null;
  // exactly one end is missing: the open slot may still be running when the closed one starts
  const [open, closed] = a.endsAt ? [b, a] : [a, b];
  const [os, cs, ce] = [open.startsAt.getTime(), closed.startsAt.getTime(), (closed.endsAt as Date).getTime()];
  if (os > cs && os < ce) return 'CERTAIN';
  return os < cs && sameDay ? 'POSSIBLE' : null;
}
