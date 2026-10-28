import { afterAll, describe, expect, it } from 'vitest';
import { closeAll, db, harness } from './harness';

afterAll(closeAll);

describe('GET /me/sessions', () => {
  it('lists_active_sessions_with_current_flag_and_cursor_pages', async () => {
    const h = harness();
    const a = await h.signedIn();
    for (let i = 0; i < 2; i++) await h.api.login(a.email, 'violet sunset harbour');
    const page1 = await h.api.sessions(a.cookie, '?limit=2');
    expect(page1.status).toBe(200);
    const items = page1.body?.items as { id: string; current: boolean; userAgent: string }[];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ userAgent: 'Chrome on Windows', createdAt: expect.any(String), lastSeenAt: expect.any(String) });
    expect(items[0]).not.toHaveProperty('tokenHash');
    const page2 = await h.api.sessions(a.cookie, `?limit=2&cursor=${page1.body?.nextCursor as string}`);
    const all = [...items, ...(page2.body?.items as { current: boolean }[])];
    expect(all).toHaveLength(3);
    expect(all.filter((s) => s.current)).toHaveLength(1);
  });
});

describe('IDOR between two accounts', () => {
  it('revoking_another_users_session_is_404_and_leaves_it_alive', async () => {
    const h = harness();
    const a = await h.signedIn();
    const b = await h.signedIn();
    const aSession = await db.sessionRegistry.findFirstOrThrow({ where: { userId: a.userId } });
    const res = await h.api.revoke(b.cookie, aSession.id);
    expect(res.body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect((await h.api.me(a.cookie)).status).toBe(200);
    expect((await h.api.revoke(b.cookie, 'not-a-uuid')).status).toBe(404);
  });

  it('preferences_are_strictly_per_user', async () => {
    const h = harness();
    const a = await h.signedIn();
    const b = await h.signedIn();
    const aPrefs = await h.api.prefs(a.cookie);
    const bPrefs = await h.api.prefs(b.cookie);
    // B uses A's ETag on its own resource: it only ever reaches B's row
    const patched = await h.api.patchPrefs(b.cookie, { aiEnabled: true }, aPrefs.headers.get('etag') as string);
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ aiEnabled: true });
    expect((await h.api.prefs(a.cookie)).body).toEqual(aPrefs.body);
    expect(bPrefs.body).toMatchObject({ aiEnabled: false });
    expect(await db.consentRecord.count({ where: { userId: a.userId } })).toBe(0);
  });
});

describe('preferences', () => {
  it('defaults_are_private_and_minimal', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    const res = await h.api.prefs(cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBe('W/"v1"');
    expect(res.body).toEqual({
      locale: 'fr',
      cityName: null,
      countryCode: null,
      latitude: null,
      longitude: null,
      timezone: null,
      aiEnabled: false,
      learningEnabled: false,
      thermalSensitivity: 'NEUTRAL',
      onboardingCompletedAt: null,
      version: 1,
    });
  });

  it('patch_needs_if_match_and_rejects_stale_versions', async () => {
    const h = harness();
    const { cookie, userId } = await h.signedIn();
    expect((await h.api.patchPrefs(cookie, { aiEnabled: true })).body).toMatchObject({ status: 428, code: 'IF_MATCH_REQUIRED' });
    const ok = await h.api.patchPrefs(cookie, { aiEnabled: true, thermalSensitivity: 'COLD', learningEnabled: false }, 'W/"v1"');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('etag')).toBe('W/"v2"');
    expect(ok.body).toMatchObject({ aiEnabled: true, learningEnabled: false, thermalSensitivity: 'COLD', version: 2 });
    const stale = await h.api.patchPrefs(cookie, { aiEnabled: false }, 'W/"v1"');
    expect(stale.body).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
    // only the AI toggle changed: one consent row
    const consents = await db.consentRecord.findMany({ where: { userId } });
    expect(consents.map((c) => [c.kind, c.granted])).toEqual([['AI_RECOMMENDATIONS', true]]);
  });

  it('concurrent_patches_with_the_same_etag_apply_once', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    const results = await Promise.all([
      h.api.patchPrefs(cookie, { locale: 'en' }, 'W/"v1"'),
      h.api.patchPrefs(cookie, { locale: 'ar' }, 'W/"v1"'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('unknown_fields_and_half_coordinates_are_400', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    expect((await h.api.patchPrefs(cookie, { gender: 'x' }, 'W/"v1"')).body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await h.api.patchPrefs(cookie, { latitude: 45 }, 'W/"v1"')).body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await h.api.patchPrefs(cookie, { timezone: 'Mars/Base' }, 'W/"v1"')).body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('POST /me/onboarding', () => {
  it('requires_only_locale_and_city', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    const res = await h.api.onboarding(cookie, { locale: 'ar', cityName: 'Casablanca' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      locale: 'ar',
      cityName: 'Casablanca',
      latitude: null,
      longitude: null,
      timezone: 'UTC',
      onboardingCompletedAt: expect.any(String),
      version: 2,
    });
    expect(res.headers.get('etag')).toBe('W/"v2"');
  });

  it('missing_city_or_locale_is_400', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    expect((await h.api.onboarding(cookie, { locale: 'fr' })).body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await h.api.onboarding(cookie, { cityName: 'Lyon' })).body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await h.api.onboarding(cookie, { locale: 'fr', cityName: '  ' })).body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('gps_and_timezone_are_optional_and_validated', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    const res = await h.api.onboarding(cookie, {
      locale: 'fr',
      cityName: 'Paris',
      countryCode: 'FR',
      latitude: 48.856613,
      longitude: 2.352222,
      timezone: 'Europe/Paris',
    });
    expect(res.body).toMatchObject({ latitude: 48.856613, longitude: 2.352222, timezone: 'Europe/Paris', countryCode: 'FR' });
  });

  it('invalid_timezone_is_400', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    for (const timezone of ['Mars/Olympus', '+01:00', 'Europe/Paris; DROP']) {
      const res = await h.api.onboarding(cookie, { locale: 'fr', cityName: 'Paris', timezone });
      expect(res.body, timezone).toMatchObject({ code: 'VALIDATION_ERROR', errors: [{ path: 'timezone' }] });
    }
  });

  it('onboarding_keeps_the_first_completion_date', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    const first = await h.api.onboarding(cookie, { locale: 'fr', cityName: 'Paris' });
    h.clock.advance(60_000);
    const second = await h.api.onboarding(cookie, { locale: 'en', cityName: 'Lille' });
    expect(second.body?.onboardingCompletedAt).toBe(first.body?.onboardingCompletedAt);
    expect(second.body).toMatchObject({ locale: 'en', cityName: 'Lille' });
  });
});
