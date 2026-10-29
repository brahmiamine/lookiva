import { createHash } from 'node:crypto';
import { layerOf, roleOf, warmthOf, type EngineRole, type Profile } from './garment';
import { RAIN_PROBABILITY, WINDY_KPH, type WeatherSummary } from './weather';

export const OCCASIONS = ['CASUAL', 'WORK', 'FORMAL', 'SPORT', 'EVENING', 'HOME', 'TRADITIONAL'] as const;
export type Occasion = (typeof OCCASIONS)[number];
export type Comfort = 'COLD' | 'NEUTRAL' | 'WARM';

const OCCASION_STYLES: Record<Occasion, string[]> = {
  CASUAL: ['CASUAL', 'STREETWEAR', 'SMART_CASUAL'], WORK: ['BUSINESS', 'SMART_CASUAL'], FORMAL: ['FORMAL', 'BUSINESS'], SPORT: ['SPORT'],
  EVENING: ['EVENING', 'FORMAL', 'SMART_CASUAL'], HOME: ['HOME', 'CASUAL'], TRADITIONAL: ['TRADITIONAL'],
};
const NEUTRALS = new Set(['BLACK', 'WHITE', 'GREY', 'BEIGE', 'NAVY', 'BROWN', 'KHAKI']);

export type Reason = { code: string; params?: Record<string, string | number> };
export type Assumption = { code: 'WARMTH_UNKNOWN' | 'RAIN_UNKNOWN' | 'WIND_UNKNOWN' | 'BREATHABILITY_UNKNOWN' | 'LAYERING_UNKNOWN' | 'SEASON_UNKNOWN'; garmentId: string };
export type Proposal = {
  fingerprint: string;
  items: { garmentId: string; role: EngineRole }[];
  missing: EngineRole[];
  reasons: Reason[];
  warnings: Reason[];
  assumptions: Assumption[];
  score: number;
};
export type Taste = { acceptedGarments: Map<string, number>; rejectedFingerprints: Set<string>; rejectedGarments: Map<string, number> };
export type EngineInput = {
  garments: readonly Profile[];
  weather: WeatherSummary | null;
  comfort: Comfort;
  occasion: Occasion;
  /** YYYY-MM-DD */
  date: string;
  /** false = southern hemisphere (seasons flip). */
  northern: boolean;
  /** Days since each garment was last worn (absent = never / unknown). */
  daysSinceWorn: ReadonlyMap<string, number>;
  excluded: ReadonlySet<string>;
  /** Only when the user opted in to personalization. */
  taste?: Taste;
};

export const fingerprintOf = (ids: readonly string[]): string => createHash('sha256').update([...ids].sort().join(',')).digest('hex');

const K = 5;
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const seasonOf = (date: string, northern: boolean): string => {
  const m = Number(date.slice(5, 7));
  const s = m === 12 || m <= 2 ? 'WINTER' : m <= 5 ? 'SPRING' : m <= 8 ? 'SUMMER' : 'AUTUMN';
  if (northern) return s;
  return { WINTER: 'SUMMER', SUMMER: 'WINTER', SPRING: 'AUTUMN', AUTUMN: 'SPRING' }[s] as string;
};
/** Required "upper warmth" (sum of top + mid + outer warmth, 1..4 each) for a felt temperature. */
const requiredWarmth = (eff: number): number => (eff >= 26 ? 1 : eff >= 20 ? 2 : eff >= 14 ? 3 : eff >= 8 ? 5 : eff >= 2 ? 7 : 9);
const RAIN_LEVEL: Record<string, number> = { WATERPROOF: 1, RESISTANT: 0.8, NONE: 0, UNKNOWN: 0.3 };

type Ctx = {
  eff: number | null; rain: boolean; windy: boolean; hot: boolean; needsOuter: boolean; offerOuter: boolean; offerMid: boolean;
  styles: Set<string>; season: string; input: EngineInput;
};

function context(input: EngineInput): Ctx {
  const w = input.weather;
  const eff = w ? w.feelsAvgC + (input.comfort === 'COLD' ? -3 : input.comfort === 'WARM' ? 3 : 0) : null;
  const rain = !!w && w.precipMax >= RAIN_PROBABILITY;
  const windy = !!w && w.windMax >= WINDY_KPH;
  const hot = eff !== null && eff >= 26;
  const needsOuter = eff !== null && (eff < 12 || (rain && eff < 22) || (windy && eff < 18));
  return {
    eff, rain, windy, hot, needsOuter,
    offerOuter: needsOuter || (eff !== null && eff < 18),
    offerMid: eff !== null && eff < 16,
    styles: new Set(OCCASION_STYLES[input.occasion]),
    season: seasonOf(input.date, input.northern),
    input,
  };
}

/** Tier 1 (weather + occasion fit of one garment), 0..1. */
function fitWeatherOccasion(g: Profile, role: EngineRole, c: Ctx): number {
  const parts: number[] = [];
  parts.push(g.styles.length === 0 ? 0.5 : g.styles.some((s) => c.styles.has(s)) ? 1 : 0);
  if (c.rain && (role === 'OUTERWEAR' || role === 'SHOES')) parts.push(role === 'OUTERWEAR' ? (RAIN_LEVEL[g.rain] ?? 0.3) : g.rain === 'UNKNOWN' ? 0.5 : (RAIN_LEVEL[g.rain] ?? 0.5));
  if (c.windy && role === 'OUTERWEAR') parts.push(g.windproof === 'YES' ? 1 : g.windproof === 'NO' ? 0 : 0.4);
  if (c.hot && role !== 'OUTERWEAR') parts.push(g.breathability === 'HIGH' ? 1 : g.breathability === 'MEDIUM' || g.breathability === 'UNKNOWN' ? 0.5 : 0);
  return parts.reduce((s, x) => s + x, 0) / parts.length;
}
/** Tier 3 for one garment: season match and color neutrality, 0..1. */
function fitStyleSeason(g: Profile, c: Ctx): number {
  const season = g.seasons.length === 0 ? 0.5 : g.seasons.includes(c.season) ? 1 : 0.1;
  return season;
}

type Pick = { g: Profile; role: EngineRole };

function evaluate(picks: Pick[], missing: EngineRole[], c: Ctx): Proposal {
  const { input, eff } = c;
  const fp = fingerprintOf(picks.map((p) => p.g.id));
  const reasons: Reason[] = [];
  const warnings: Reason[] = [];
  const assumptions: Assumption[] = [];
  const asm = (code: Assumption['code'], g: Profile) => assumptions.push({ code, garmentId: g.id });

  // tier 1: weather + occasion
  const t1 = picks.reduce((s, p) => s + fitWeatherOccasion(p.g, p.role, c), 0) / picks.length;
  // tier 2: thermal comfort (warmth of the upper layers vs the felt temperature)
  const upper = picks.filter((p) => p.role !== 'BOTTOM' && p.role !== 'SHOES');
  const warmth = upper.reduce((s, p) => s + warmthOf(p.g).value * (p.role === 'ONE_PIECE' ? 1.5 : 1), 0);
  let t2 = 0.5;
  if (eff !== null) {
    const need = requiredWarmth(eff);
    t2 = clamp(1 - Math.abs(warmth - need) / need);
    if (warmth < need - 2) warnings.push({ code: 'WARMTH_LOW', params: { feelsLikeC: Math.round(eff) } });
    if (c.hot && warmth > 3) warnings.push({ code: 'TOO_WARM_FOR_HEAT', params: { feelsLikeC: Math.round(eff) } });
  }
  // tier 3: styles / colors / season / (opt-in) taste
  const colors = new Set(picks.flatMap((p) => [p.g.primaryColor, ...p.g.extraColors]).filter((x) => !NEUTRALS.has(x)));
  const harmony = colors.size <= 2 ? 1 : colors.size === 3 ? 0.5 : 0;
  const seasonFit = picks.reduce((s, p) => s + fitStyleSeason(p.g, c), 0) / picks.length;
  let taste = 0;
  if (input.taste) {
    const likes = picks.reduce((s, p) => s + Math.min(3, input.taste!.acceptedGarments.get(p.g.id) ?? 0) / 3, 0) / picks.length;
    const dislikes = picks.reduce((s, p) => s + Math.min(3, input.taste!.rejectedGarments.get(p.g.id) ?? 0) / 3, 0) / picks.length;
    taste = likes - dislikes - (input.taste.rejectedFingerprints.has(fp) ? 1 : 0);
    if (taste !== 0) reasons.push({ code: 'PERSONALIZED' });
  }
  const t3 = clamp(0.5 * harmony + 0.5 * seasonFit + 0.3 * taste, 0, 1.3);
  // tier 4: variety (recently worn ranks slightly lower, never excluded)
  const recency = picks.reduce((s, p) => {
    const d = input.daysSinceWorn.get(p.g.id);
    return s + (d === undefined ? 0 : clamp(1 - d / 14));
  }, 0) / picks.length;
  const t4 = 1 - recency;
  if (recency > 0.3) reasons.push({ code: 'RECENTLY_WORN_DEPRIORITIZED' });

  // reasons / warnings / assumptions (explainability)
  const has = (r: EngineRole) => picks.find((p) => p.role === r);
  if (has('ONE_PIECE')) reasons.push({ code: 'ONE_PIECE_COMPLETE' });
  const outer = has('OUTERWEAR');
  const mids = picks.filter((p) => p.role === 'TOP' && layerOf(p.g).layer === 'MID' && picks.some((q) => q.role === 'TOP' && q !== p));
  if (eff !== null) {
    reasons.push({ code: eff < 12 ? 'WEATHER_COLD' : c.hot ? 'WEATHER_HOT' : 'WEATHER_MILD', params: { feelsLikeC: Math.round(eff) } });
    if (input.comfort !== 'NEUTRAL') reasons.push({ code: input.comfort === 'COLD' ? 'COMFORT_COLD_SENSITIVE' : 'COMFORT_WARM_RUNNING' });
    if (mids.length) reasons.push({ code: 'LAYERED', params: { layers: picks.filter((p) => p.role === 'TOP' || p.role === 'OUTERWEAR').length } });
  }
  if (outer && c.rain) {
    reasons.push({ code: 'RAIN_OUTERWEAR_INCLUDED', params: { precipProbability: input.weather!.precipMax } });
    if (outer.g.rain === 'NONE') warnings.push({ code: 'NOT_RAIN_PROTECTED' });
    else if (outer.g.rain === 'UNKNOWN') { warnings.push({ code: 'RAIN_PROTECTION_UNKNOWN' }); asm('RAIN_UNKNOWN', outer.g); }
  }
  if (outer && c.windy) {
    reasons.push({ code: 'WIND_OUTERWEAR_INCLUDED', params: { windKph: input.weather!.windMax } });
    if (outer.g.windproof === 'NO') warnings.push({ code: 'NOT_WINDPROOF' });
    else if (outer.g.windproof === 'UNKNOWN') asm('WIND_UNKNOWN', outer.g);
  }
  if (c.hot && picks.some((p) => p.role !== 'OUTERWEAR' && p.g.breathability === 'HIGH')) reasons.push({ code: 'BREATHABLE_FOR_HEAT' });
  if (picks.some((p) => input.occasion && p.g.styles.some((s) => c.styles.has(s)))) reasons.push({ code: 'OCCASION_MATCH', params: { occasion: input.occasion } });
  if (colors.size <= 2) reasons.push({ code: 'COLORS_HARMONIOUS' });
  for (const p of picks) {
    if (input.weather) {
      if (p.g.warmth === 'UNKNOWN') asm('WARMTH_UNKNOWN', p.g);
      if (c.hot && p.role !== 'OUTERWEAR' && p.g.breathability === 'UNKNOWN') asm('BREATHABILITY_UNKNOWN', p.g);
      if (c.offerMid && (p.role === 'TOP' || p.role === 'OUTERWEAR') && layerOf(p.g).assumed) asm('LAYERING_UNKNOWN', p.g);
    }
    if (p.g.seasons.length === 0) asm('SEASON_UNKNOWN', p.g);
  }
  if (missing.length) warnings.push({ code: 'INCOMPLETE', params: { missing: missing.join(',') } });
  if (!input.weather) warnings.push({ code: 'NO_WEATHER' });
  else if (input.weather.reliability === 'LOW') warnings.push({ code: 'LOW_WEATHER_RELIABILITY' });

  // Lexicographic-ish weights: weather/occasion > comfort > styles/colors > variety.
  const score = 1000 * t1 + 100 * t2 + 10 * t3 + t4;
  return {
    fingerprint: fp,
    items: picks.map((p) => ({ garmentId: p.g.id, role: p.role })),
    missing, reasons, warnings, assumptions, score,
  };
}

/** Up to `limit` DISTINCT proposals (fewer when the wardrobe cannot make more), best first, never a padded one. */
export function recommend(input: EngineInput, limit: number): Proposal[] {
  const c = context(input);
  const pools: Record<EngineRole, Pick[]> = { TOP: [], BOTTOM: [], ONE_PIECE: [], OUTERWEAR: [], SHOES: [] };
  for (const g of input.garments) {
    const role = roleOf(g);
    if (role) pools[role].push({ g, role });
  }
  const pre = (p: Pick) => 1000 * fitWeatherOccasion(p.g, p.role, c) + 10 * fitStyleSeason(p.g, c) + (input.taste?.acceptedGarments.get(p.g.id) ?? 0) - (input.taste?.rejectedGarments.get(p.g.id) ?? 0);
  const top = (a: Pick[], n = K) => [...a].sort((x, y) => pre(y) - pre(x) || (x.g.id < y.g.id ? -1 : 1)).slice(0, n);

  const tops = top(pools.TOP);
  const bottoms = top(pools.BOTTOM);
  const onePieces = top(pools.ONE_PIECE);
  const shoes = top(pools.SHOES);
  const mids = top(pools.TOP.filter((p) => layerOf(p.g).layer === 'MID'));
  const outers = top(pools.OUTERWEAR);

  // Base layer options: one-piece, or top + bottom; partial (with a missing role) only when no complete base exists.
  const bases: { picks: Pick[]; missing: EngineRole[] }[] = [];
  for (const o of onePieces) bases.push({ picks: [o], missing: [] });
  for (const t of tops) for (const b of bottoms) bases.push({ picks: [t, b], missing: [] });
  if (!bases.length) {
    if (tops.length) for (const t of tops) bases.push({ picks: [t], missing: ['BOTTOM'] });
    else if (bottoms.length) for (const b of bottoms) bases.push({ picks: [b], missing: ['TOP'] });
  }
  const shoeOpts: (Pick | null)[] = shoes.length ? shoes : [null];
  const outOpts: (Pick | null)[] = c.needsOuter ? (outers.length ? outers : [null]) : c.offerOuter ? [null, ...outers] : [null];

  const seen = new Map<string, Proposal>();
  for (const base of bases) {
    const midOpts: (Pick | null)[] = c.offerMid && base.picks.some((p) => p.role !== 'BOTTOM') ? [null, ...mids] : [null];
    for (const s of shoeOpts) for (const m of midOpts) for (const o of outOpts) {
      const picks = [...base.picks];
      const baseTop = picks.find((p) => p.role === 'TOP');
      if (m) {
        if (picks.some((p) => p.g.id === m.g.id)) continue;
        if (baseTop && layerOf(baseTop.g).layer !== 'BASE') continue; // a mid layer goes over a base layer
        picks.push(m);
      }
      if (s) picks.push(s);
      if (o) picks.push(o);
      const missing = [...base.missing, ...(s ? [] : (['SHOES'] as EngineRole[])), ...(c.needsOuter && !o ? (['OUTERWEAR'] as EngineRole[]) : [])];
      const fp = fingerprintOf(picks.map((p) => p.g.id));
      if (input.excluded.has(fp) || seen.has(fp)) continue;
      seen.set(fp, evaluate(picks, missing, c));
    }
  }

  // Greedy pick with a small penalty for overlap with what is already chosen (variety across the proposals).
  const rest = [...seen.values()].sort((a, b) => b.score - a.score || (a.fingerprint < b.fingerprint ? -1 : 1));
  const out: Proposal[] = [];
  while (out.length < limit && rest.length) {
    let best = 0;
    let bestScore = -Infinity;
    rest.forEach((p, i) => {
      const ids = new Set(p.items.map((x) => x.garmentId));
      const overlap = out.length ? Math.max(...out.map((q) => q.items.filter((x) => ids.has(x.garmentId)).length / Math.max(ids.size, q.items.length))) : 0;
      const s = p.score - 40 * overlap;
      if (s > bestScore) { bestScore = s; best = i; }
    });
    out.push(...rest.splice(best, 1));
  }
  return out;
}
