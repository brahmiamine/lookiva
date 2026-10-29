import { randomUUID } from 'node:crypto';
import type { OptionalRecommendationAI } from '@/platform/ai/recommendation';
import type { Clock } from '@/platform/clock/port';
import { AppError } from '@/platform/http/errors';
import type { OwnerId } from '@/platform/kernel';
import type { GarmentGateway } from '@/modules/wardrobe';
import type { Role } from '@/modules/outfits';
import type { Preferences } from '@/modules/identity';
import { fingerprintOf, recommend, type Comfort, type Occasion, type Proposal, type Taste } from '../domain/engine';
import { roleOf, type EngineRole, type Profile } from '../domain/garment';
import { compareWeather, summarize, type Hour } from '../domain/weather';
import type { BaselineStore, Counter, FeedbackAction, FeedbackStore, SessionStore } from './ports';
import type { WeatherService } from './weather-service';

// Compile-time guard: every engine role is a real outfit role (outfits owns the enum).
const _roles: EngineRole extends Role ? true : never = true;
void _roles;

export type RecoConfig = { aiDailyCap: number; aiTimeoutMs: number; sessionTtlMs: number; poolSize: number; feedbackWindow: number };
export const DEFAULT_RECO_CONFIG: RecoConfig = { aiDailyCap: 10, aiTimeoutMs: 3000, sessionTtlMs: 2 * 3600_000, poolSize: 8, feedbackWindow: 200 };
export type AiStatus = 'USED' | 'NOT_CONFIGURED' | 'NO_CONSENT' | 'DISABLED' | 'QUOTA' | 'TIMEOUT' | 'ERROR' | 'INVALID_OUTPUT' | 'SKIPPED';

export type RecommendInput = { date: string; from: number; to: number; occasion: Occasion; cityOverride?: string; sessionId?: string; count: number; useAi: boolean };
const notFound = (what: string) => new AppError('NOT_FOUND', 404, `${what} not found`);
const day = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000));

export function createRecommendationService(deps: {
  garments: GarmentGateway;
  prefs: { get(o: OwnerId): Promise<Preferences | null> };
  wears: { lastWornDates(o: OwnerId, ids: string[]): Promise<Map<string, string>> };
  outfits: { schedule(o: OwnerId, id: string): Promise<{ status: string; localDate: string | null; localTime: string | null; timezone: string | null; startsAt: Date | null; endsAt: Date | null } | null> };
  weather: WeatherService;
  sessions: SessionStore;
  feedback: FeedbackStore;
  baselines: BaselineStore;
  counter: Counter;
  ai: OptionalRecommendationAI | null;
  clock: Clock;
  config?: Partial<RecoConfig>;
  log?: (msg: string, data: object) => void;
}) {
  const cfg = { ...DEFAULT_RECO_CONFIG, ...deps.config };
  const { clock, garments } = deps;
  const log = deps.log ?? (() => undefined);
  const prefsOf = async (owner: OwnerId) => {
    const p = await deps.prefs.get(owner);
    if (!p) throw notFound('Preferences');
    return p;
  };
  const toProfile = (g: Awaited<ReturnType<GarmentGateway['listRecommendable']>>[number]): Profile => ({
    id: g.id, categoryCode: g.categoryCode, subtypeCode: g.subtypeCode, primaryColor: g.primaryColorCode, extraColors: g.extraColorCodes,
    warmth: g.warmth, rain: g.rain, windproof: g.windproof, breathability: g.breathability, layering: g.layering, seasons: g.seasons, styles: g.styles,
  });

  /** GET /weather */
  async function weatherFor(owner: OwnerId, q: { date: string; from: number; to: number; cityOverride?: string }) {
    const p = await prefsOf(owner);
    const w = await deps.weather.forWindow(p, q);
    if (!w.ok) return { weatherAvailable: false as const, reason: w.reason, date: q.date, from: q.from, to: q.to };
    return {
      weatherAvailable: true as const, date: q.date, from: q.from, to: q.to,
      location: { label: w.place.label, latitude: w.place.latitude, longitude: w.place.longitude, timezone: w.place.timezone },
      source: w.source, provider: w.provider, issuedAt: w.issuedAt.toISOString(), summary: w.summary, hours: w.window,
    };
  }

  async function taste(owner: OwnerId): Promise<Taste> {
    const t: Taste = { acceptedGarments: new Map(), rejectedFingerprints: new Set(), rejectedGarments: new Map() };
    for (const f of await deps.feedback.recent(owner, cfg.feedbackWindow)) {
      if (f.action === 'REJECT') {
        t.rejectedFingerprints.add(f.fingerprint);
        for (const id of f.garmentIds) t.rejectedGarments.set(id, (t.rejectedGarments.get(id) ?? 0) + 1);
      } else if (f.action === 'ACCEPT') for (const id of f.garmentIds) t.acceptedGarments.set(id, (t.acceptedGarments.get(id) ?? 0) + 1);
    }
    return t;
  }

  /** The AI may only ORDER rule-made candidates. Returns the reordered proposals, or a status explaining why not. */
  async function rerank(owner: OwnerId, p: Preferences, input: RecommendInput, pool: Proposal[], profiles: Map<string, Profile>, ctx: { tempBand: string; rain: boolean; windy: boolean }): Promise<{ status: AiStatus; proposals: Proposal[]; used?: number }> {
    if (!deps.ai) return { status: 'NOT_CONFIGURED', proposals: pool };
    if (!p.aiEnabled) return { status: 'NO_CONSENT', proposals: pool }; // AI_RECOMMENDATIONS consent mirrored in preferences
    if (!input.useAi) return { status: 'DISABLED', proposals: pool };
    if (pool.length < 2) return { status: 'SKIPPED', proposals: pool };
    const used = await deps.counter.incr(`reco-ai:${owner}:${day(clock.now())}`, 2 * 86_400);
    if (used > cfg.aiDailyCap) {
      log('recommendation AI daily cap reached', { used, cap: cfg.aiDailyCap });
      return { status: 'QUOTA', proposals: pool, used };
    }
    const ids = new Set(pool.flatMap((x) => x.items.map((i) => i.garmentId)));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), cfg.aiTimeoutMs);
    try {
      // Opaque ids + categorical attributes ONLY: no photo, nickname, notes, price.
      const res = await Promise.race([
        deps.ai.rerank(
          {
            context: { occasion: input.occasion, ...ctx },
            garments: [...ids].map((id) => {
              const g = profiles.get(id) as Profile;
              return { id, role: roleOf(g) ?? 'OTHER', category: g.categoryCode, warmth: g.warmth, rain: g.rain, windproof: g.windproof, breathability: g.breathability, layering: g.layering, colors: [g.primaryColor, ...g.extraColors], styles: g.styles };
            }),
            candidates: pool.map((x) => ({ garmentIds: x.items.map((i) => i.garmentId) })),
          },
          { signal: ctl.signal },
        ),
        new Promise<never>((_, rej) => ctl.signal.addEventListener('abort', () => rej(new Error('TIMEOUT')))),
      ]);
      if (!res || !Array.isArray(res.ranking)) return { status: 'INVALID_OUTPUT', proposals: pool, used };
      const byFp = new Map(pool.map((x) => [x.fingerprint, x]));
      const ordered: Proposal[] = [];
      for (const r of res.ranking) {
        if (!Array.isArray(r) || r.some((id) => typeof id !== 'string' || !ids.has(id))) continue; // unknown / foreign id: dropped
        const hit = byFp.get(fingerprintOf(r));
        if (hit && !ordered.includes(hit)) ordered.push(hit); // only compositions the rules made: the AI invents nothing
      }
      if (!ordered.length) return { status: 'INVALID_OUTPUT', proposals: pool, used };
      return { status: 'USED', proposals: [...ordered, ...pool.filter((x) => !ordered.includes(x))], used };
    } catch (e) {
      log('recommendation AI failed, rules used', { reason: (e as Error).message === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR' });
      return { status: (e as Error).message === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR', proposals: pool, used };
    } finally {
      clearTimeout(timer);
    }
  }

  /** POST /recommendations/outfits. Saves nothing but the fingerprints of the session. */
  async function propose(owner: OwnerId, input: RecommendInput) {
    const now = clock.now();
    const p = await prefsOf(owner);
    let shown: string[] = [];
    let sessionId = input.sessionId;
    if (sessionId) {
      const s = await deps.sessions.shown(owner, sessionId, now);
      if (!s) throw notFound('Recommendation session');
      shown = s;
    } else {
      sessionId = randomUUID();
      await deps.sessions.purgeExpired(owner, now);
      await deps.sessions.create(owner, sessionId, now, new Date(now.getTime() + cfg.sessionTtlMs));
    }

    const w = await deps.weather.forWindow(p, input);
    const weather = w.ok ? w : null;
    const list = (await garments.listRecommendable(owner, 1000)).map(toProfile); // ponytail: newest 1000 garments, paginate if wardrobes grow
    const profiles = new Map(list.map((g) => [g.id, g]));
    const worn = await deps.wears.lastWornDates(owner, list.map((g) => g.id));
    const daysSinceWorn = new Map([...worn].map(([id, d]) => [id, daysBetween(d, input.date) ]));
    const comfort: Comfort = p.thermalSensitivity;
    const usePool = deps.ai && p.aiEnabled && input.useAi ? Math.max(cfg.poolSize, input.count) : input.count;
    const pool = recommend(
      {
        garments: list, weather: weather?.summary ?? null, comfort, occasion: input.occasion, date: input.date,
        northern: !((weather?.place.latitude ?? p.latitude ?? 1) < 0),
        daysSinceWorn, excluded: new Set(shown), taste: p.personalization ? await taste(owner) : undefined,
      },
      usePool,
    );
    const sum = weather?.summary;
    const ai = await rerank(owner, p, input, pool, profiles, { tempBand: sum ? (sum.feelsAvgC < 5 ? 'COLD' : sum.feelsAvgC < 15 ? 'COOL' : sum.feelsAvgC < 25 ? 'MILD' : 'HOT') : 'UNKNOWN', rain: !!sum && sum.precipMax >= 50, windy: !!sum && sum.windMax >= 40 });

    // Last line of defence (races, buggy AI): every id must still be an own, non-trashed, AVAILABLE garment.
    const wanted = ai.proposals.slice(0, input.count * 3);
    const live = new Map((await garments.find(owner, [...new Set(wanted.flatMap((x) => x.items.map((i) => i.garmentId)))])).map((g) => [g.id, g]));
    const proposals = wanted.filter((x) => x.items.every((i) => live.get(i.garmentId)?.status === 'AVAILABLE' && !live.get(i.garmentId)?.trashed)).slice(0, input.count);

    await deps.sessions.save(owner, sessionId, [...shown, ...proposals.map((x) => x.fingerprint)].slice(-300), new Date(now.getTime() + cfg.sessionTtlMs));
    const weatherSource = weather ? weather.source : null;
    const issuedAt = weather ? weather.issuedAt.toISOString() : null;
    return {
      source: ai.status === 'USED' ? ('RULES+AI' as const) : ('RULES' as const),
      sessionId, date: input.date, occasion: input.occasion, comfort,
      weatherAvailable: !!weather,
      manualFallback: !weather,
      weather: weather ? { source: weather.source, provider: weather.provider, issuedAt: weather.issuedAt.toISOString(), summary: weather.summary, location: weather.place.label } : { reason: w.ok ? 'NO_DATA' : w.reason },
      proposals: proposals.map((x) => ({ fingerprint: x.fingerprint, items: x.items, missing: x.missing, reasons: x.reasons, warnings: x.warnings, assumptions: x.assumptions, weatherSource, issuedAt })),
      exhausted: proposals.length < input.count,
      ai: { status: ai.status, used: ai.used ?? null, dailyCap: cfg.aiDailyCap },
    };
  }

  async function addFeedback(owner: OwnerId, b: { sessionId?: string; action: FeedbackAction; garmentIds: string[] }) {
    const found = await garments.find(owner, b.garmentIds);
    const bad = b.garmentIds.flatMap((id, i) => (found.some((g) => g.id === id) ? [] : [{ path: `garmentIds.${i}`, message: `garment ${id} not found` }]));
    if (bad.length) throw new AppError('NOT_FOUND', 404, 'Some garments were not found; nothing was recorded', bad);
    const row = { id: randomUUID(), sessionId: b.sessionId ?? null, fingerprint: fingerprintOf(b.garmentIds), action: b.action, garmentIds: b.garmentIds, createdAt: clock.now() };
    await deps.feedback.add(owner, row);
    return { id: row.id, fingerprint: row.fingerprint, action: row.action, garmentIds: row.garmentIds, createdAt: row.createdAt.toISOString() };
  }

  const windowOf = (s: { localTime: string | null; startsAt: Date | null; endsAt: Date | null; timezone: string | null }) => {
    const from = Number((s.localTime ?? '08:00').slice(0, 2));
    let to = Math.min(23, from + 6);
    if (s.startsAt && s.endsAt && s.timezone && s.endsAt.getTime() - s.startsAt.getTime() < 86_400_000) {
      const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: s.timezone, hour: '2-digit', hourCycle: 'h23' }).format(s.endsAt));
      if (h > from) to = h;
    }
    return { from, to };
  };
  const scheduled = async (owner: OwnerId, outfitId: string) => {
    const s = /^[0-9a-f-]{36}$/i.test(outfitId) ? await deps.outfits.schedule(owner, outfitId) : null;
    if (!s) throw notFound('Outfit');
    if (!s.localDate || !s.timezone) throw new AppError('OUTFIT_NOT_SCHEDULED', 422, 'The outfit needs a start date and timezone to compare weather');
    return { ...s, localDate: s.localDate, timezone: s.timezone, ...windowOf(s) };
  };

  /** POST /outfits/{id}/weather-baseline: remembers the forecast the outfit is planned against (never touches the outfit). */
  async function setBaseline(owner: OwnerId, outfitId: string, cityOverride?: string) {
    const s = await scheduled(owner, outfitId);
    const p = await prefsOf(owner);
    const resolved = await deps.weather.resolvePlace(p, cityOverride);
    if (!('place' in resolved)) return { weatherAvailable: false as const, reason: resolved.reason };
    const d = await deps.weather.day(resolved.place, s.localDate);
    if (!d.ok) return { weatherAvailable: false as const, reason: d.reason };
    await deps.baselines.upsert(owner, { outfitId, latitude: resolved.place.latitude, longitude: resolved.place.longitude, timezone: resolved.place.timezone, localDate: s.localDate, fromHour: s.from, toHour: s.to, provider: d.provider, issuedAt: d.issuedAt, hours: d.hours }, clock.now());
    return { weatherAvailable: true as const, issuedAt: d.issuedAt.toISOString(), provider: d.provider, summary: summarize(d.hours, s.from, s.to) };
  }

  /** GET /outfits/{id}/weather-impact: compares the stored forecast with a fresh one. Only describes; `replaced` is always false. */
  async function impact(owner: OwnerId, outfitId: string) {
    await scheduled(owner, outfitId); // ownership + scheduled check
    const base = await deps.baselines.get(owner, outfitId);
    const common = { outfitId, replaced: false as const, thresholds: { tempC: 5, precipPoints: 30, windKph: 20 } };
    if (!base) return { ...common, baselineAvailable: false, weatherAvailable: null, impact: false, changes: [], warnings: [], suggestions: [] };
    const before = summarize(base.hours, base.fromHour, base.toHour);
    const fresh = await deps.weather.day({ latitude: base.latitude, longitude: base.longitude, timezone: base.timezone, label: '' }, base.localDate);
    const after = fresh.ok ? summarize(fresh.hours as Hour[], base.fromHour, base.toHour) : null;
    if (!before || !after) return { ...common, baselineAvailable: true, weatherAvailable: false, reason: fresh.ok ? 'NO_DATA' : fresh.reason, impact: false, changes: [], warnings: [], suggestions: [] };
    const c = compareWeather(before, after);
    return { ...common, baselineAvailable: true, weatherAvailable: true, baselineIssuedAt: base.issuedAt.toISOString(), currentIssuedAt: (fresh as { issuedAt: Date }).issuedAt.toISOString(), before, after, impact: c.warnings.length > 0, ...c };
  }

  return { weatherFor, propose, addFeedback, removeFeedback: (o: OwnerId, id: string) => deps.feedback.remove(o, id), removeAllFeedback: (o: OwnerId) => deps.feedback.removeAll(o), setBaseline, impact };
}
export type RecommendationService = ReturnType<typeof createRecommendationService>;
