import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { identityRoutes } from '@/modules/identity';
import type { Locale } from '@/i18n/config';

// Server-side reads for the guarded pages: the identity route handlers are called in-process with the browser's
// cookie header (GET only: no CSRF, same session checks as the HTTP API: revoked/expired/unverified => 401).
type Route = (req: Request) => Promise<Response>;

async function get(route: Route, path: string): Promise<Response> {
  const cookie = (await headers()).get('cookie') ?? '';
  return route(new Request(`http://internal/api/v1${path}`, { headers: { cookie } }));
}

export type PreferencesView = {
  locale: Locale;
  cityName: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  aiEnabled: boolean;
  learningEnabled: boolean;
  thermalSensitivity: 'COLD' | 'NEUTRAL' | 'WARM';
  onboardingCompletedAt: string | null;
  version: number;
};

/** Layout-level guard of the whole (app) group: no valid session => login, whatever page is added later. */
export async function requireSession(locale: Locale): Promise<void> {
  const res = await get(identityRoutes.me, '/me');
  if (res.status === 401) redirect(`/${locale}/login`);
  if (!res.ok) throw new Error(`session check unavailable (${res.status})`);
}

/**
 * Per-page guard of every (app) page (also returns the preferences). No session => login. `onboarded` pages send unfinished accounts to onboarding;
 * the onboarding page sends finished accounts to their profile. Any other failure goes to the error boundary.
 */
export async function requireAccount(locale: Locale, need: 'onboarded' | 'onboarding') {
  const res = await get(identityRoutes.getPreferences, '/me/preferences');
  if (res.status === 401) redirect(`/${locale}/login`);
  if (!res.ok) throw new Error(`preferences unavailable (${res.status})`);
  const prefs = (await res.json()) as PreferencesView;
  if (need === 'onboarded' && !prefs.onboardingCompletedAt) redirect(`/${locale}/onboarding`);
  if (need === 'onboarding' && prefs.onboardingCompletedAt) redirect(`/${locale}/settings/profile`);
  return { prefs, etag: res.headers.get('ETag') ?? '' };
}

/** GET of another private route for a page already guarded by requireAccount. */
export async function getJson<T>(route: Route, path: string, locale: Locale): Promise<T> {
  const res = await get(route, path);
  if (res.status === 401) redirect(`/${locale}/login`);
  if (!res.ok) throw new Error(`${path} unavailable (${res.status})`);
  return (await res.json()) as T;
}

/** Canonical IANA zones of the server runtime, passed to the client so both render the same options. */
export const timeZones = (): string[] => Intl.supportedValuesOf('timeZone');
