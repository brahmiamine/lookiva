import { describe, expect, it } from 'vitest';
import { FakeRecommendationAi, type FakeRecoAiMode } from '@/platform/ai/fake-recommendation';
import { FakeClock } from '@/platform/clock/fake';
import { FakeGeocoder } from '@/platform/geocoder/fake';
import { FakeWeather, type FakeWeatherMode } from '@/platform/weather/fake';
import type { GarmentGateway, RecommendableGarment } from '@/modules/wardrobe';
import { createRecommendationService } from '@/modules/recommendations/application/service';
import { createWeatherService } from '@/modules/recommendations/application/weather-service';
import type { Baseline, Counter, FeedbackRow, StoredSnapshot } from '@/modules/recommendations/application/ports';

import type { OwnerId } from '@/platform/kernel';
const A = '00000000-0000-4000-8000-00000000000a' as unknown as OwnerId;
const B = '00000000-0000-4000-8000-00000000000b' as unknown as OwnerId;
let n = 0;
const garment = (categoryCode: string, subtypeCode: string, o: Partial<RecommendableGarment> = {}): RecommendableGarment => ({
  id: `10000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, categoryCode, subtypeCode, primaryColorCode: 'BLACK', extraColorCodes: [],
  warmth: 'MEDIUM', rain: 'RESISTANT', windproof: 'YES', breathability: 'MEDIUM', layering: 'UNKNOWN', seasons: ['AUTUMN'], styles: [], ...o,
});
const full = () => [garment('TOPS', 'SHIRT'), garment('TOPS', 'POLO'), garment('BOTTOMS', 'JEANS'), garment('BOTTOMS', 'CHINOS'), garment('FOOTWEAR', 'SNEAKERS'), garment('FOOTWEAR', 'BOOTS'), garment('OUTERWEAR', 'COAT'), garment('OUTERWEAR', 'RAINCOAT')];

const SHARED: Record<string, RecommendableGarment[]> = { [A]: full(), [B]: full() };
function setup(o: { wardrobe?: Record<string, RecommendableGarment[]>; aiMode?: FakeRecoAiMode | null; weatherMode?: FakeWeatherMode | null; prefs?: Record<string, unknown>; aiCap?: number; timeoutMs?: number } = {}) {
  const clock = new FakeClock(new Date('2026-11-10T08:00:00Z'));
  const store = { owned: o.wardrobe ?? SHARED, status: new Map<string, string>() };
  const garments = {
    listRecommendable: async (owner: string) => (store.owned[owner] ?? []).filter((g) => (store.status.get(g.id) ?? 'AVAILABLE') === 'AVAILABLE'),
    find: async (owner: string, ids: string[]) => (store.owned[owner] ?? []).filter((g) => ids.includes(g.id)).map((g) => ({ id: g.id, status: store.status.get(g.id) ?? 'AVAILABLE', trashed: false })),
  } as unknown as GarmentGateway;
  const counters = new Map<string, number>();
  const counter: Counter = { incr: async (k) => counters.set(k, (counters.get(k) ?? 0) + 1).get(k) as number };
  const snaps: StoredSnapshot[] = [];
  const weatherProvider = o.weatherMode === null ? null : new FakeWeather(o.weatherMode ?? 'ok', undefined, () => clock.now());
  const weather = createWeatherService({
    provider: weatherProvider, geocoder: new FakeGeocoder(), counter, clock, config: { timeoutMs: o.timeoutMs ?? 50, dailyCallCap: 100 },
    store: {
      latest: async (key, date, since) => snaps.filter((s) => s.locationKey === key && s.localDate === date && s.fetchedAt >= since).at(-1) ?? null,
      save: async (s) => void snaps.push(s), purge: async () => undefined,
    },
  });
  const sessions = new Map<string, { owner: string; fps: string[]; exp: Date }>();
  const feedback: (FeedbackRow & { owner: string })[] = [];
  const baselines = new Map<string, Baseline>();
  const ai = o.aiMode === null || o.aiMode === undefined ? null : new FakeRecommendationAi(o.aiMode);
  const prefs = { cityName: 'Paris', latitude: 48.85, longitude: 2.35, timezone: 'Europe/Paris', aiEnabled: true, personalization: false, thermalSensitivity: 'NEUTRAL', ...o.prefs };
  const svc = createRecommendationService({
    garments, clock, weather, ai, counter, config: { aiDailyCap: o.aiCap ?? 3, aiTimeoutMs: o.timeoutMs ?? 50 },
    prefs: { get: async () => prefs as never },
    wears: { lastWornDates: async () => new Map() },
    outfits: { schedule: async () => ({ status: 'PLANNED', localDate: '2026-11-10', localTime: '09:00', timezone: 'Europe/Paris', startsAt: new Date('2026-11-10T08:00:00Z'), endsAt: null }) },
    sessions: {
      create: async (owner, id, _n, exp) => void sessions.set(id, { owner, fps: [], exp }),
      shown: async (owner, id, now) => { const s = sessions.get(id); return s && s.owner === owner && s.exp > now ? s.fps : null; },
      save: async (_o, id, fps) => void (sessions.get(id)!.fps = fps), purgeExpired: async () => undefined,
    },
    feedback: {
      add: async (owner, r) => void feedback.push({ ...r, owner }),
      recent: async (owner) => feedback.filter((f) => f.owner === owner),
      remove: async (owner, id) => { const i = feedback.findIndex((f) => f.id === id && f.owner === owner); if (i >= 0) feedback.splice(i, 1); return i >= 0; },
      removeAll: async (owner) => { const k = feedback.filter((f) => f.owner === owner).length; for (let i = feedback.length - 1; i >= 0; i--) if (feedback[i]!.owner === owner) feedback.splice(i, 1); return k; },
    },
    baselines: { upsert: async (_o, b) => void baselines.set(b.outfitId, b), get: async (_o, id) => baselines.get(id) ?? null },
  });
  return { svc, clock, store, ai, weatherProvider, snaps, counters, sessions, feedback, prefs, baselines };
}
const req = { date: '2026-11-10', from: 8, to: 20, occasion: 'CASUAL' as const, count: 3, useAi: true };
const ids = (r: { proposals: { items: { garmentId: string }[] }[] }) => r.proposals.flatMap((p) => p.items.map((i) => i.garmentId));

describe('weather service', () => {
  it('caches_within_ttl_and_refetches_after_it_with_an_injected_clock', async () => {
    const t = setup();
    await t.svc.weatherFor(A, { date: '2026-11-10', from: 8, to: 20 });
    const second = await t.svc.weatherFor(A, { date: '2026-11-10', from: 8, to: 20 });
    expect(t.weatherProvider!.calls).toBe(1);
    expect(second).toMatchObject({ weatherAvailable: true, source: 'CACHE' });
    t.clock.advance(31 * 60_000);
    expect(await t.svc.weatherFor(A, { date: '2026-11-10', from: 8, to: 20 })).toMatchObject({ source: 'PROVIDER' });
    expect(t.weatherProvider!.calls).toBe(2);
  });
  it('is_deterministic_per_place_and_date_and_city_override_changes_the_place', async () => {
    const t = setup();
    const a = await t.svc.weatherFor(A, { date: '2026-11-10', from: 8, to: 20 });
    const t2 = setup();
    expect(await t2.svc.weatherFor(A, { date: '2026-11-10', from: 8, to: 20 })).toMatchObject({ summary: (a as { summary: object }).summary });
    const o = await t.svc.weatherFor(A, { date: '2026-11-10', from: 8, to: 20, cityOverride: 'Tunis' });
    expect(o).toMatchObject({ weatherAvailable: true, location: { label: 'Tunis' } });
  });
  it.each([['fail', 'PROVIDER_ERROR'], ['hang', 'TIMEOUT'], ['empty', 'NO_DATA']] as const)('provider_%s_gives_unavailable_never_a_forecast', async (mode, reason) => {
    const t = setup({ weatherMode: mode });
    expect(await t.svc.weatherFor(A, { date: '2026-11-10', from: 8, to: 20 })).toEqual({ weatherAvailable: false, reason, date: '2026-11-10', from: 8, to: 20 });
    expect(t.snaps).toHaveLength(0);
  });
  it('no_provider_unknown_city_and_provider_quota', async () => {
    expect(await setup({ weatherMode: null }).svc.weatherFor(A, { date: '2026-11-10', from: 8, to: 20 })).toMatchObject({ weatherAvailable: false, reason: 'NO_PROVIDER' });
    expect(await setup().svc.weatherFor(A, { date: '2026-11-10', from: 8, to: 20, cityOverride: 'Atlantis' })).toMatchObject({ reason: 'CITY_NOT_FOUND' });
    const t = setup();
    t.counters.set('weather-calls:2026-11-10', 100);
    expect(await t.svc.weatherFor(A, { date: '2026-11-10', from: 8, to: 20 })).toMatchObject({ reason: 'QUOTA' });
    expect(t.weatherProvider!.calls).toBe(0);
  });
});

describe('propose', () => {
  it('weather_down_gives_manual_fallback_with_rules_proposals', async () => {
    const r = await setup({ weatherMode: 'fail' }).svc.propose(A, req);
    expect(r).toMatchObject({ weatherAvailable: false, manualFallback: true, source: 'RULES', weather: { reason: 'PROVIDER_ERROR' } });
    expect(r.proposals.length).toBeGreaterThan(0);
    expect(r.proposals.every((p) => p.weatherSource === null && p.issuedAt === null && p.warnings.some((w) => w.code === 'NO_WEATHER'))).toBe(true);
  });
  it('proposals_carry_weather_source_and_issuedAt_and_only_own_available_garments', async () => {
    const t = setup();
    const own = new Set(t.store.owned[A]!.map((g) => g.id));
    const [toWash] = t.store.owned[A]!;
    t.store.status.set(toWash!.id, 'TO_WASH');
    const r = await t.svc.propose(A, req);
    expect(r.proposals.length).toBeGreaterThan(0);
    for (const p of r.proposals) expect(p).toMatchObject({ weatherSource: 'PROVIDER', issuedAt: '2026-11-10T08:00:00.000Z' });
    expect(ids(r).every((id) => own.has(id) && id !== toWash!.id)).toBe(true);
  });
  it('cross_user_isolation_and_foreign_session_is_404', async () => {
    const t = setup();
    const a = await t.svc.propose(A, req);
    const mineB = new Set(t.store.owned[B]!.map((g) => g.id));
    expect(ids(await t.svc.propose(B, req)).every((id) => mineB.has(id))).toBe(true);
    await expect(t.svc.propose(B, { ...req, sessionId: a.sessionId })).rejects.toMatchObject({ status: 404 });
  });
  it('another_proposal_via_session_never_repeats_until_exhausted', async () => {
    const t = setup();
    const seen = new Set<string>();
    let sessionId: string | undefined;
    for (let i = 0; i < 6; i++) {
      const r = await t.svc.propose(A, { ...req, sessionId });
      sessionId = r.sessionId;
      for (const p of r.proposals) { expect(seen.has(p.fingerprint)).toBe(false); seen.add(p.fingerprint); }
    }
    expect(seen.size).toBeGreaterThan(3);
  });
  it('expired_session_is_404', async () => {
    const t = setup();
    const r = await t.svc.propose(A, req);
    t.clock.advance(3 * 3600_000);
    await expect(t.svc.propose(A, { ...req, sessionId: r.sessionId })).rejects.toMatchObject({ status: 404 });
  });
  it('nothing_is_saved_except_fingerprints_and_garments_are_untouched', async () => {
    const t = setup();
    const before = JSON.stringify(t.store);
    const r = await t.svc.propose(A, req);
    expect(JSON.stringify(t.store)).toBe(before);
    expect([...t.sessions.values()][0]!.fps).toEqual(r.proposals.map((p) => p.fingerprint));
  });
  it('personalization_off_ignores_feedback_and_on_uses_it', async () => {
    const off = setup();
    const first = (await off.svc.propose(A, { ...req, count: 1 })).proposals[0]!;
    for (const prefs of [{ personalization: false }, { personalization: true }]) {
      const t = setup({ prefs });
      for (let i = 0; i < 3; i++) await t.svc.addFeedback(A, { action: 'REJECT', garmentIds: first.items.map((x) => x.garmentId) });
      const top = (await t.svc.propose(A, { ...req, count: 1 })).proposals[0]!;
      if (prefs.personalization) expect(top.fingerprint).not.toBe(first.fingerprint);
      else expect(top.fingerprint).toBe(first.fingerprint);
    }
  });
});

describe('optional AI', () => {
  const run = (o: Parameters<typeof setup>[0]) => { const t = setup(o); return t.svc.propose(A, req).then((r) => ({ t, r })); };
  it('used_reorders_rule_candidates_only_and_sends_no_photo_or_free_text', async () => {
    const rules = await setup().svc.propose(A, req);
    const { t, r } = await run({ aiMode: 'reverse' });
    expect(r).toMatchObject({ source: 'RULES+AI', ai: { status: 'USED', used: 1, dailyCap: 3 } });
    expect(new Set(r.proposals.map((p) => p.fingerprint))).not.toEqual(new Set()); // sanity
    expect(t.ai!.calls).toBe(1);
    const sent = JSON.stringify(t.ai!.lastRequest);
    expect(sent).not.toMatch(/photo|image|url|nickname|notes|price|blob/i);
    for (const gm of t.ai!.lastRequest!.garments) expect(Object.keys(gm).sort()).toEqual(['breathability', 'category', 'colors', 'id', 'layering', 'rain', 'role', 'styles', 'warmth', 'windproof']);
    expect(rules.proposals.length).toBe(r.proposals.length);
  });
  it.each([
    ['not configured', { aiMode: null }, 'NOT_CONFIGURED'],
    ['no consent', { aiMode: 'reverse' as const, prefs: { aiEnabled: false } }, 'NO_CONSENT'],
    ['throws', { aiMode: 'throw' as const }, 'ERROR'],
    ['hangs', { aiMode: 'hang' as const }, 'TIMEOUT'],
    ['garbage', { aiMode: 'garbage' as const }, 'INVALID_OUTPUT'],
  ])('%s_falls_back_to_rules', async (_n, o, status) => {
    const rules = await setup().svc.propose(A, req);
    const { t, r } = await run(o as Parameters<typeof setup>[0]);
    expect(r).toMatchObject({ source: 'RULES', ai: { status } });
    expect(r.proposals.map((p) => p.fingerprint)).toEqual(rules.proposals.map((p) => p.fingerprint));
    if (status === 'NO_CONSENT' || status === 'NOT_CONFIGURED') { expect(t.ai?.calls ?? 0).toBe(0); expect([...t.counters.keys()].some((k) => k.startsWith('reco-ai'))).toBe(false); }
  });
  it('foreign_or_invented_ids_in_ai_output_are_dropped', async () => {
    const { r } = await run({ aiMode: 'foreign' });
    expect(r.source).toBe('RULES+AI');
    expect(ids(r).every((id) => !id.endsWith('ff'))).toBe(true);
  });
  it('daily_cap_is_enforced_per_user_and_observable', async () => {
    const t = setup({ aiMode: 'reverse', aiCap: 2 });
    const statuses: string[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await t.svc.propose(A, req)).ai.status);
    expect(statuses).toEqual(['USED', 'USED', 'QUOTA', 'QUOTA']);
    expect(t.ai!.calls).toBe(2);
    expect((await t.svc.propose(B, req)).ai.status).toBe('USED'); // per user
    t.clock.advance(86_400_000);
    expect((await t.svc.propose(A, req)).ai.status).toBe('USED'); // next UTC day
  });
  it('client_can_opt_out_per_request', async () => {
    const t = setup({ aiMode: 'reverse' });
    expect((await t.svc.propose(A, { ...req, useAi: false })).ai.status).toBe('DISABLED');
    expect(t.ai!.calls).toBe(0);
  });
});

describe('weather impact', () => {
  it('compares_baseline_to_a_new_forecast_and_never_replaces_the_outfit', async () => {
    const t = setup();
    const oid = '20000000-0000-4000-8000-000000000001';
    expect(await t.svc.impact(A, oid)).toMatchObject({ baselineAvailable: false, impact: false, replaced: false });
    await t.svc.setBaseline(A, oid);
    t.clock.advance(31 * 60_000);
    expect(await t.svc.impact(A, oid)).toMatchObject({ baselineAvailable: true, weatherAvailable: true, impact: false, changes: [] });
    const b = t.baselines.get(oid)!;
    t.baselines.set(oid, { ...b, hours: b.hours.map((h) => ({ ...h, tempC: h.tempC - 10, feelsLikeC: h.feelsLikeC - 10, precipProbability: 0 })) });
    const r = await t.svc.impact(A, oid);
    expect(r.impact).toBe(true);
    expect(r.replaced).toBe(false);
    expect(r.warnings).toContain('TEMP_RISE');
    expect(r.suggestions).toContain('REQUEST_NEW_RECOMMENDATION');
  });
  it('weather_down_reports_unavailable', async () => {
    const t = setup();
    const oid = '20000000-0000-4000-8000-000000000001';
    await t.svc.setBaseline(A, oid);
    t.clock.advance(31 * 60_000);
    t.weatherProvider!.mode = 'fail';
    expect(await t.svc.impact(A, oid)).toMatchObject({ baselineAvailable: true, weatherAvailable: false, impact: false });
  });
});
