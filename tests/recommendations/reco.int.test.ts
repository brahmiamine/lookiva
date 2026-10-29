import { afterAll, describe, expect, it } from 'vitest';
import { closeAll, db, recoHarness, type Json } from './harness';

afterAll(closeAll);

const today = () => new Date().toISOString().slice(0, 10);
const COMBO: [string, string, Json][] = [
  ['TOPS', 'SHIRT', { layering: 'BASE', warmth: 'MEDIUM' }], ['TOPS', 'POLO', { layering: 'BASE', warmth: 'LIGHT' }], ['BOTTOMS', 'JEANS', {}], ['BOTTOMS', 'CHINOS', {}],
  ['FOOTWEAR', 'SNEAKERS', {}], ['FOOTWEAR', 'BOOTS', {}], ['OUTERWEAR', 'COAT', { warmth: 'WARM' }], ['OUTERWEAR', 'RAINCOAT', { rain: 'WATERPROOF' }],
];
async function setup() {
  const h = recoHarness();
  const u = await h.signedIn();
  const mk = async (c: string, s: string, extra: Json = {}) =>
    ((await h.api.createGarment(u.cookie, { categoryCode: c, subtypeCode: s, primaryColor: { code: 'BLACK' }, ...extra })).body as Json).id as string;
  const ids: string[] = [];
  for (const [c, s, x] of COMBO) ids.push(await mk(c, s, x));
  const prefs = async (patch: Json) => {
    const cur = await h.idApi.prefs(u.cookie);
    return h.idApi.patchPrefs(u.cookie, patch, cur.headers.get('etag') as string);
  };
  // unique place per test: the weather cache lives in the shared db
  await prefs({ cityName: 'Paris', latitude: Math.round(Math.random() * 7000) / 100, longitude: Math.round(Math.random() * 17000) / 100, timezone: 'Europe/Paris' });
  return { h, u, ids, mk, prefs };
}
const body = (o: Json = {}) => ({ date: today(), occasion: 'CASUAL', ...o });

describe('recommendations over HTTP', () => {
  it('weather_endpoint_caches_and_override_and_unauthenticated_401', async () => {
    const { h, u } = await setup();
    const a = await h.weather(u.cookie, `?date=${today()}`);
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ weatherAvailable: true, source: 'PROVIDER', location: { label: 'Paris' } });
    expect((await h.weather(u.cookie, `?date=${today()}`)).body).toMatchObject({ source: 'CACHE' });
    expect(h.rweather.calls).toBe(1);
    expect((await h.weather(u.cookie, `?date=${today()}&cityOverride=Tunis`)).body).toMatchObject({ location: { label: 'Tunis' } });
    h.rweather.mode = 'fail';
    expect((await h.weather(u.cookie, `?date=${today()}&cityOverride=Lyon`)).body).toMatchObject({ weatherAvailable: false, reason: 'PROVIDER_ERROR' });
    expect((await h.weather(u.cookie, '?date=nope')).status).toBe(400);
    expect((await h.weather(undefined, `?date=${today()}`)).status).toBe(401);
    expect((await h.recommend(undefined, body())).status).toBe(401);
  });

  it('recommend_returns_distinct_available_own_garments_and_saves_no_outfit', async () => {
    const { h, u, ids } = await setup();
    await h.api.setStatus(u.cookie, ids[0]!, { status: 'TO_WASH' }, 'W/"v1"');
    const r = await h.recommend(u.cookie, body());
    expect(r.status).toBe(200);
    const b = r.body as Json;
    expect(b.source).toBe('RULES');
    expect(b.proposals.length).toBeGreaterThan(0);
    expect(new Set(b.proposals.map((p: Json) => p.fingerprint)).size).toBe(b.proposals.length);
    const used = b.proposals.flatMap((p: Json) => p.items.map((i: Json) => i.garmentId));
    expect(used.every((id: string) => ids.includes(id) && id !== ids[0])).toBe(true);
    expect((await h.o.list(u.cookie)).body?.items).toEqual([]);
    expect(b.proposals[0]).toMatchObject({ weatherSource: 'PROVIDER' });
  });

  it('another_user_never_sees_my_garments_or_session', async () => {
    const { h, u, ids } = await setup();
    const other = await h.signedIn();
    expect(((await h.recommend(other.cookie, body())).body as Json).proposals).toEqual([]);
    const mine = (await h.recommend(u.cookie, body())).body as Json;
    expect((await h.recommend(other.cookie, body({ sessionId: mine.sessionId }))).status).toBe(404);
    expect((await h.feedback(other.cookie, { action: 'ACCEPT', garmentIds: [ids[0]] })).status).toBe(404);
  });

  it('another_proposal_never_repeats_via_session', async () => {
    const { h, u } = await setup();
    const seen = new Set<string>();
    let sessionId: string | undefined;
    for (let i = 0; i < 4; i++) {
      const b = (await h.recommend(u.cookie, body({ sessionId }))).body as Json;
      sessionId = b.sessionId;
      for (const p of b.proposals) { expect(seen.has(p.fingerprint)).toBe(false); seen.add(p.fingerprint); }
    }
  });

  it('ai_needs_consent_then_caps_at_two_per_day_and_falls_back_to_rules', async () => {
    const { h, u, prefs } = await setup();
    expect(((await h.recommend(u.cookie, body())).body as Json).ai.status).toBe('NO_CONSENT');
    expect(h.rai.calls).toBe(0);
    expect((await prefs({ aiEnabled: true })).status).toBe(200);
    const s = [] as string[];
    for (let i = 0; i < 3; i++) s.push(((await h.recommend(u.cookie, body())).body as Json).ai.status);
    expect(s).toEqual(['USED', 'USED', 'QUOTA']);
    expect(JSON.stringify(h.rai.lastRequest)).not.toMatch(/photo|image|url|nickname/i);
  });

  it('feedback_is_deletable_alone_and_does_not_touch_outfits_or_garments', async () => {
    const { h, u, ids } = await setup();
    const o = await h.o.create(u.cookie, { items: [{ garmentId: ids[0], role: 'TOP' }] });
    const f1 = await h.feedback(u.cookie, { action: 'ACCEPT', garmentIds: [ids[0], ids[2]] });
    const f2 = await h.feedback(u.cookie, { action: 'REJECT', garmentIds: [ids[1]] });
    expect([f1.status, f2.status]).toEqual([201, 201]);
    expect((await h.del(u.cookie, (f1.body as Json).id)).status).toBe(204);
    expect((await h.del(u.cookie, (f1.body as Json).id)).status).toBe(404);
    expect((await h.delAll(u.cookie)).body).toEqual({ deleted: 1 });
    expect((await h.o.get(u.cookie, (o.body as Json).id)).status).toBe(200);
    expect((await h.api.getGarment(u.cookie, ids[0]!)).status).toBe(200);
    expect(await db.recommendationFeedback.count({ where: { ownerId: u.userId } })).toBe(0);
    expect((await h.feedback(u.cookie, { action: 'LIKE', garmentIds: [ids[0]] })).status).toBe(400);
  });

  it('weather_impact_warns_on_change_and_never_replaces_the_outfit', async () => {
    const { h, u, ids } = await setup();
    const day = today();
    const o = (await h.o.create(u.cookie, { status: 'PLANNED', occasion: 'Work', startsAt: `${day}T09:00:00+01:00`, timezone: 'Europe/Paris', items: [{ garmentId: ids[0], role: 'TOP' }] })).body as Json;
    expect(((await h.impact(u.cookie, o.id)).body as Json)).toMatchObject({ baselineAvailable: false, impact: false });
    expect(((await h.baseline(u.cookie, o.id)).body as Json).weatherAvailable).toBe(true);
    h.clock.advance(31 * 60_000);
    expect(((await h.impact(u.cookie, o.id)).body as Json)).toMatchObject({ baselineAvailable: true, weatherAvailable: true, impact: false });
    const row = await db.outfitWeatherBaseline.findUniqueOrThrow({ where: { outfitId: o.id } });
    const warm = (row.payload as Json[]).map((x) => ({ ...x, tempC: x.tempC + 12, feelsLikeC: x.feelsLikeC + 12 }));
    await db.outfitWeatherBaseline.update({ where: { outfitId: o.id }, data: { payload: warm } });
    const r = (await h.impact(u.cookie, o.id)).body as Json;
    expect(r).toMatchObject({ impact: true, replaced: false });
    expect(r.warnings).toContain('TEMP_DROP');
    const after = (await h.o.get(u.cookie, o.id)).body as Json;
    expect(after.items).toEqual(o.items);
    expect(after.version).toBe(o.version);
    const draft = (await h.o.create(u.cookie, {})).body as Json;
    expect((await h.baseline(u.cookie, draft.id)).status).toBe(422);
    expect((await h.impact((await h.signedIn()).cookie, o.id)).status).toBe(404);
  });

  it('preferences_expose_personalization_default_off', async () => {
    const { h, u, prefs } = await setup();
    expect((await h.idApi.prefs(u.cookie)).body).toMatchObject({ personalization: false, thermalSensitivity: 'NEUTRAL' });
    expect((await prefs({ personalization: true, thermalSensitivity: 'COLD' })).body).toMatchObject({ personalization: true, thermalSensitivity: 'COLD' });
  });
});
