import { DEFAULT_LOCALE, isLocale, type Locale } from './config';

const LOCALE_LIKE = /^[a-z]{2}(-[A-Za-z]{2})?$/;

// Known limitation: a top-level app route must never be a bare 2-letter segment
// (e.g. `/me`), since it would be read as an unsupported locale and rewritten to `/fr`.
export function resolveLocale(pathname: string): { locale: Locale; redirectTo?: string } {
  const [, first = '', ...rest] = pathname.split('/');
  if (isLocale(first)) return { locale: first };
  const tail = rest.length ? `/${rest.join('/')}` : '';
  // unsupported locale-like segment is replaced, anything else gets the default prefixed
  const kept = LOCALE_LIKE.test(first) ? tail : first ? `/${first}${tail}` : tail;
  return { locale: DEFAULT_LOCALE, redirectTo: `/${DEFAULT_LOCALE}${kept}` };
}
