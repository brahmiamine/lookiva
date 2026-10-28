export const LOCALES = ['fr', 'en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export const THERMAL_SENSITIVITIES = ['COLD', 'NEUTRAL', 'WARM'] as const;
export type ThermalSensitivity = (typeof THERMAL_SENSITIVITIES)[number];

const CANONICAL = new Set(Intl.supportedValuesOf('timeZone'));
// IANA names only: Area/Location segments or single names like UTC (rejects offsets such as +01:00).
const IANA_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

/** True for canonical IANA zones and the aliases the runtime knows (UTC, Europe/Kiev...). */
export function isIanaTimeZone(tz: string): boolean {
  if (CANONICAL.has(tz)) return true;
  if (!IANA_SHAPE.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
