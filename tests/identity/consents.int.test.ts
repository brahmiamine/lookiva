import { afterAll, describe, expect, it } from 'vitest';
import { asOwnerId } from '@/platform/kernel';
import { createPrismaIdentityStore } from '@/modules/identity/infrastructure/prisma-store';
import { closeAll, db, harness } from './harness';

afterAll(closeAll);

type Item = { kind: string; granted: boolean; updatedAt: string | null };

describe('consents', () => {
  it('lists_all_three_kinds_as_not_granted_before_any_answer', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    const res = await h.api.consents(cookie);
    expect(res.body?.items).toEqual([
      { kind: 'AI_RECOMMENDATIONS', granted: false, updatedAt: null },
      { kind: 'LEARNING', granted: false, updatedAt: null },
      { kind: 'CLOUD_BACKGROUND_REMOVAL', granted: false, updatedAt: null },
    ]);
  });

  it('put_appends_a_record_and_keeps_the_preference_flag_consistent', async () => {
    const h = harness();
    const { cookie, userId } = await h.signedIn();
    const on = await h.api.setConsent(cookie, 'AI_RECOMMENDATIONS', { granted: true });
    expect(on.body).toMatchObject({ kind: 'AI_RECOMMENDATIONS', granted: true, updatedAt: expect.any(String) });
    expect((await h.api.prefs(cookie)).body).toMatchObject({ aiEnabled: true, learningEnabled: false, version: 2 });

    await h.api.setConsent(cookie, 'LEARNING', { granted: true });
    await h.api.setConsent(cookie, 'AI_RECOMMENDATIONS', { granted: false });
    expect((await h.api.prefs(cookie)).body).toMatchObject({ aiEnabled: false, learningEnabled: true });
    const latest = (await h.api.consents(cookie)).body?.items as Item[];
    expect(latest.map((c) => [c.kind, c.granted])).toEqual([
      ['AI_RECOMMENDATIONS', false],
      ['LEARNING', true],
      ['CLOUD_BACKGROUND_REMOVAL', false],
    ]);
    expect(await db.consentRecord.count({ where: { userId, kind: 'AI_RECOMMENDATIONS' } })).toBe(2); // history is appended, never rewritten
  });

  it('a_repeated_put_appends_a_record_but_does_not_change_the_preferences_version', async () => {
    const h = harness();
    const { cookie, userId } = await h.signedIn();
    await h.api.setConsent(cookie, 'LEARNING', { granted: true });
    const v = (await h.api.prefs(cookie)).body?.version;
    await h.api.setConsent(cookie, 'LEARNING', { granted: true });
    expect((await h.api.prefs(cookie)).body?.version).toBe(v);
    expect(await db.consentRecord.count({ where: { userId, kind: 'LEARNING' } })).toBe(2);
  });

  it('patching_the_preference_is_reflected_in_the_latest_consent', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    await h.api.patchPrefs(cookie, { aiEnabled: true }, 'W/"v1"');
    expect(((await h.api.consents(cookie)).body?.items as Item[])[0]).toMatchObject({ kind: 'AI_RECOMMENDATIONS', granted: true });
  });

  it('cloud_background_removal_is_recorded_without_touching_preferences', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    await h.api.setConsent(cookie, 'CLOUD_BACKGROUND_REMOVAL', { granted: true });
    expect((await h.api.prefs(cookie)).body).toMatchObject({ aiEnabled: false, learningEnabled: false, version: 1 });
    expect(((await h.api.consents(cookie)).body?.items as Item[])[2]).toMatchObject({ kind: 'CLOUD_BACKGROUND_REMOVAL', granted: true });
  });

  it('put_is_limited_to_30_per_minute_per_user', async () => {
    const h = harness();
    const a = await h.signedIn();
    const b = await h.signedIn();
    for (let i = 0; i < 30; i++) expect((await h.api.setConsent(a.cookie, 'CLOUD_BACKGROUND_REMOVAL', { granted: i % 2 === 0 })).status).toBe(200);
    const limited = await h.api.setConsent(a.cookie, 'LEARNING', { granted: true });
    expect(limited.body).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/);
    expect((await h.api.setConsent(b.cookie, 'LEARNING', { granted: true })).status).toBe(200);
  });

  it('concurrent_puts_never_leave_the_flag_different_from_the_latest_record', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    for (let round = 0; round < 5; round++) {
      await Promise.all([true, false, true, false].map((granted) => h.api.setConsent(cookie, 'LEARNING', { granted })));
      const flag = (await h.api.prefs(cookie)).body?.learningEnabled;
      const latest = ((await h.api.consents(cookie)).body?.items as Item[])[1]?.granted;
      expect(flag).toBe(latest);
    }
  });

  it('same_instant_concurrent_records_get_strictly_increasing_timestamps_and_the_flag_follows_the_latest', async () => {
    const h = harness();
    const { userId } = await h.signedIn();
    const store = createPrismaIdentityStore(db);
    const owner = asOwnerId(userId);
    const now = new Date(); // every call carries the same clock reading
    for (let round = 0; round < 15; round++) {
      await Promise.all(Array.from({ length: 6 }, (_, i) => store.recordConsent(owner, 'AI_RECOMMENDATIONS', (round + i) % 3 === 0, now)));
      const rows = await db.consentRecord.findMany({ where: { userId, kind: 'AI_RECOMMENDATIONS' }, orderBy: { createdAt: 'asc' } });
      expect(new Set(rows.map((r) => r.createdAt.getTime())).size).toBe(rows.length);
      const [latest] = await store.latestConsents(owner);
      expect(latest?.granted).toBe(rows.at(-1)?.granted);
      expect((await store.getPreferences(owner))?.aiEnabled).toBe(rows.at(-1)?.granted);
    }
  });

  it('a_patch_right_after_a_put_in_the_same_instant_is_the_latest_record', async () => {
    const h = harness();
    const { userId } = await h.signedIn();
    const store = createPrismaIdentityStore(db);
    const owner = asOwnerId(userId);
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      await store.recordConsent(owner, 'AI_RECOMMENDATIONS', true, now); // may be bumped to now+k ms
      const prefs = (await store.getPreferences(owner)) as { version: number };
      await store.updatePreferences(owner, prefs.version, { aiEnabled: false }, [{ kind: 'AI_RECOMMENDATIONS', granted: false }], now);
      expect((await store.latestConsents(owner))[0]?.granted).toBe(false);
      expect((await store.getPreferences(owner))?.aiEnabled).toBe(false);
    }
  });

  it('rejects_unknown_kinds_photo_kinds_and_bad_bodies', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    for (const kind of ['PHOTO_RECOGNITION', 'AI', 'ai_recommendations']) {
      expect((await h.api.setConsent(cookie, kind, { granted: true })).body, kind).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    }
    for (const body of [{}, { granted: 'yes' }, { granted: true, extra: 1 }]) {
      expect((await h.api.setConsent(cookie, 'LEARNING', body)).body, JSON.stringify(body)).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    }
  });

  it('needs_a_session_and_is_strictly_per_user', async () => {
    const h = harness();
    expect((await h.api.consents(undefined)).status).toBe(401);
    const a = await h.signedIn();
    const b = await h.signedIn();
    await h.api.setConsent(a.cookie, 'LEARNING', { granted: true });
    expect(((await h.api.consents(b.cookie)).body?.items as Item[])[1]).toMatchObject({ kind: 'LEARNING', granted: false, updatedAt: null });
    expect((await h.api.prefs(b.cookie)).body).toMatchObject({ learningEnabled: false });
  });

  it('audits_kind_and_decision_without_personal_data', async () => {
    const h = harness();
    const a = await h.signedIn();
    await h.api.setConsent(a.cookie, 'LEARNING', { granted: true });
    expect(h.audit.events.find((e) => e.action === 'identity.consent_recorded')).toEqual({
      actorId: a.userId,
      action: 'identity.consent_recorded',
      target: 'LEARNING:granted',
    });
  });
});
