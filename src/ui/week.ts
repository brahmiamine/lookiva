// Week arithmetic for the planning view. Weeks start on Monday and are UTC: the planning time zone rule is still open.
const DAY = 86_400_000;

/** Monday 00:00 UTC of the week that contains `d`. */
export function weekStart(d: Date): Date {
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday));
}

export const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY);

/** YYYY-MM-DD of a UTC instant. */
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
