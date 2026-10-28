import type { Locale } from './config';

// Latin digits are forced in Phase 02; the user preference arrives in phase 03.
export const formatDate = (locale: Locale, date: Date, timeZone: string): string =>
  new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date);

export const formatNumber = (locale: Locale, n: number): string =>
  new Intl.NumberFormat(`${locale}-u-nu-latn`).format(n);
