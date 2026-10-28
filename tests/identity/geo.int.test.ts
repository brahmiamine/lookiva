import { afterAll, describe, expect, it } from 'vitest';
import { closeAll, harness } from './harness';

afterAll(closeAll);

describe('GET /geo/cities', () => {
  it('requires_a_session', async () => {
    const h = harness();
    expect((await h.api.cities(undefined, 'Paris')).body).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('returns_candidates_named_in_the_users_locale', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    const fr = await h.api.cities(cookie, 'london');
    expect(fr.status).toBe(200);
    expect(fr.body).toEqual({
      items: [{ name: 'Londres', countryCode: 'GB', latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London' }],
    });
    const etag = (await h.api.prefs(cookie)).headers.get('etag') as string;
    await h.api.patchPrefs(cookie, { locale: 'ar' }, etag);
    expect(((await h.api.cities(cookie, 'london')).body?.items as { name: string }[])[0]?.name).toBe('لندن');
  });

  it('validates_q_length_between_2_and_80', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    for (const q of [undefined, '', ' a ', 'x'.repeat(81)]) {
      expect((await h.api.cities(cookie, q)).body, String(q)).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    }
    expect((await h.api.cities(cookie, 'x'.repeat(80))).status).toBe(200);
  });

  it('is_limited_to_30_requests_per_minute_per_user', async () => {
    const h = harness();
    const a = await h.signedIn();
    const b = await h.signedIn();
    for (let i = 0; i < 30; i++) expect((await h.api.cities(a.cookie, 'paris')).status).toBe(200);
    const limited = await h.api.cities(a.cookie, 'paris');
    expect(limited.body).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/);
    expect((await h.api.cities(b.cookie, 'paris')).status).toBe(200); // the budget is per user
  });

  it('never_logs_the_query', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    const q = 'secret-city-query-zq';
    await h.api.cities(cookie, q);
    await h.api.cities(cookie, 'x'); // a rejected query is not logged either
    expect(h.logs()).not.toContain(q);
    expect(h.logs()).not.toContain('secret-city');
    expect(JSON.stringify(h.audit.events)).not.toContain(q);
  });
});

describe('onboarding with a geocoder candidate or a manual city', () => {
  it('stores_the_chosen_candidate_with_its_timezone_and_coordinates', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    const [tunis] = (await h.api.cities(cookie, 'tunis')).body?.items as Record<string, unknown>[];
    const res = await h.api.onboarding(cookie, { locale: 'fr', cityName: tunis?.name, countryCode: tunis?.countryCode, latitude: tunis?.latitude, longitude: tunis?.longitude, timezone: tunis?.timezone });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cityName: 'Tunis', countryCode: 'TN', latitude: 36.8065, longitude: 10.1815, timezone: 'Africa/Tunis' });
    expect(res.body?.onboardingCompletedAt).toEqual(expect.any(String));
  });

  it('accepts_a_manual_city_with_an_explicit_timezone_and_no_gps', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    const res = await h.api.onboarding(cookie, { locale: 'en', cityName: 'Tiny Village', timezone: 'Pacific/Auckland' });
    expect(res.body).toMatchObject({ cityName: 'Tiny Village', timezone: 'Pacific/Auckland', latitude: null, longitude: null, countryCode: null });
  });

  it('rejects_an_invalid_iana_timezone', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    for (const timezone of ['Mars/Olympus', '+01:00', 'Europe/Paris; DROP', '']) {
      const res = await h.api.onboarding(cookie, { locale: 'fr', cityName: 'Paris', timezone });
      expect(res.body, timezone).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    }
    expect((await h.api.prefs(cookie)).body).toMatchObject({ cityName: null, onboardingCompletedAt: null });
  });
});
