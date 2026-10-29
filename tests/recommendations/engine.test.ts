import { describe, expect, it } from 'vitest';
import { fingerprintOf, recommend, type EngineInput } from '@/modules/recommendations/domain/engine';
import { roleOf, type Profile } from '@/modules/recommendations/domain/garment';
import { compareWeather, summarize, type Hour, type WeatherSummary } from '@/modules/recommendations/domain/weather';

// Small seeded generator (fast-check is not a dependency): reproducible random wardrobes.
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const KINDS: [string, string][] = [['TOPS', 'TSHIRT'], ['KNITWEAR', 'SWEATER'], ['BOTTOMS', 'JEANS'], ['ONE_PIECE', 'DRESS'], ['OUTERWEAR', 'COAT'], ['OUTERWEAR', 'RAINCOAT'], ['FOOTWEAR', 'SNEAKERS'], ['ACCESSORIES', 'SCARF'], ['BAGS', 'TOTE']];
const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)] as T;
let n = 0;
const g = (o: Partial<Profile> & Pick<Profile, 'categoryCode'>): Profile => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, subtypeCode: null, primaryColor: 'BLACK', extraColors: [], warmth: 'UNKNOWN', rain: 'UNKNOWN',
  windproof: 'UNKNOWN', breathability: 'UNKNOWN', layering: 'UNKNOWN', seasons: [], styles: [], ...o,
});
const wardrobe = (r: () => number, size: number): Profile[] =>
  Array.from({ length: size }, () => {
    const [categoryCode, subtypeCode] = pick(r, KINDS);
    return g({ categoryCode, subtypeCode, primaryColor: pick(r, ['BLACK', 'RED', 'BLUE', 'GREEN', 'WHITE']), warmth: pick(r, ['UNKNOWN', 'LIGHT', 'MEDIUM', 'WARM', 'VERY_WARM']), rain: pick(r, ['UNKNOWN', 'NONE', 'RESISTANT', 'WATERPROOF']), layering: pick(r, ['UNKNOWN', 'BASE', 'MID']), styles: r() < 0.5 ? [] : [pick(r, ['CASUAL', 'FORMAL', 'SPORT'])] });
  });
const sum = (o: Partial<WeatherSummary> = {}): WeatherSummary => ({ hours: 12, tempAvgC: 10, feelsAvgC: 10, feelsMinC: 8, feelsMaxC: 12, precipMax: 10, windMax: 10, reliability: 'HIGH', ...o });
const base = (garments: Profile[], o: Partial<EngineInput> = {}): EngineInput => ({ garments, weather: sum(), comfort: 'NEUTRAL', occasion: 'CASUAL', date: '2026-11-10', northern: true, daysSinceWorn: new Map(), excluded: new Set(), ...o });
const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);

describe('recommend (properties over random wardrobes)', () => {
  it('only_given_garments_at_most_3_distinct_no_duplicate_ids', () => {
    for (const seed of SEEDS) {
      const r = rng(seed);
      const w = wardrobe(r, Math.floor(r() * 25));
      const ids = new Set(w.map((x) => x.id));
      for (const weather of [null, sum(), sum({ feelsAvgC: -2, precipMax: 80 }), sum({ feelsAvgC: 31, tempAvgC: 31 })]) {
        const out = recommend(base(w, { weather }), 3);
        expect(out.length).toBeLessThanOrEqual(3);
        expect(new Set(out.map((p) => p.fingerprint)).size).toBe(out.length);
        for (const p of out) {
          const own = p.items.map((i) => i.garmentId);
          expect(new Set(own).size).toBe(own.length);
          expect(own.every((id) => ids.has(id))).toBe(true);
          expect(p.fingerprint).toBe(fingerprintOf(own));
          expect(p.items.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('never_a_padded_third_proposal_when_the_wardrobe_only_allows_fewer', () => {
    const one = recommend(base([g({ categoryCode: 'ONE_PIECE', subtypeCode: 'DRESS' }), g({ categoryCode: 'FOOTWEAR', subtypeCode: 'FLATS' })], { weather: sum({ feelsAvgC: 22 }) }), 3);
    expect(one).toHaveLength(1);
    expect(recommend(base([]), 3)).toEqual([]);
    expect(recommend(base([g({ categoryCode: 'ACCESSORIES', subtypeCode: 'SCARF' })]), 3)).toEqual([]);
  });

  it('a_dress_is_complete_without_a_bottom', () => {
    const dress = g({ categoryCode: 'ONE_PIECE', subtypeCode: 'DRESS' });
    const [p] = recommend(base([dress, g({ categoryCode: 'FOOTWEAR', subtypeCode: 'FLATS' })], { weather: sum({ feelsAvgC: 24 }) }), 3);
    expect(p?.items.map((i) => i.role).sort()).toEqual(['ONE_PIECE', 'SHOES']);
    expect(p?.missing).toEqual([]);
  });

  it('cold_and_rain_require_outerwear_when_owned_else_it_is_reported_missing', () => {
    for (const seed of SEEDS) {
      const r = rng(seed);
      const w = wardrobe(r, 6 + Math.floor(r() * 20));
      const owned = w.some((x) => roleOf(x) === 'OUTERWEAR');
      for (const p of recommend(base(w, { weather: sum({ feelsAvgC: 2, precipMax: 90 }) }), 3)) {
        const has = p.items.some((i) => i.role === 'OUTERWEAR');
        if (owned) expect(has).toBe(true);
        else expect(p.missing).toContain('OUTERWEAR');
      }
    }
  });

  it('weather_absent_runs_without_invented_conditions_and_flags_it', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const r = rng(seed);
      for (const p of recommend(base(wardrobe(r, 15), { weather: null }), 3)) {
        expect(p.warnings.map((x) => x.code)).toContain('NO_WEATHER');
        expect(p.reasons.some((x) => x.code.startsWith('WEATHER_') || x.code.includes('RAIN') || x.code.includes('WIND'))).toBe(false);
      }
    }
  });

  it('another_proposal_never_repeats_a_fingerprint', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const r = rng(seed);
      const w = wardrobe(r, 14);
      const shown = new Set<string>();
      for (let round = 0; round < 8; round++) {
        const out = recommend(base(w, { excluded: shown }), 3);
        for (const p of out) {
          expect(shown.has(p.fingerprint)).toBe(false);
          shown.add(p.fingerprint);
        }
      }
    }
  });
});

describe('recommend (rules)', () => {
  it('unknown_rain_is_an_assumption_and_ranks_below_a_known_waterproof_coat', () => {
    const unknown = g({ categoryCode: 'OUTERWEAR', subtypeCode: 'COAT', rain: 'UNKNOWN' });
    const proof = g({ categoryCode: 'OUTERWEAR', subtypeCode: 'RAINCOAT', rain: 'WATERPROOF' });
    const rest = [g({ categoryCode: 'TOPS', subtypeCode: 'SHIRT', layering: 'BASE' }), g({ categoryCode: 'BOTTOMS', subtypeCode: 'JEANS' }), g({ categoryCode: 'FOOTWEAR', subtypeCode: 'BOOTS' })];
    const out = recommend(base([unknown, proof, ...rest], { weather: sum({ feelsAvgC: 8, precipMax: 85 }) }), 3);
    expect(out[0]?.items.map((i) => i.garmentId)).toContain(proof.id);
    const withUnknown = out.find((p) => p.items.some((i) => i.garmentId === unknown.id));
    expect(withUnknown?.assumptions).toContainEqual({ code: 'RAIN_UNKNOWN', garmentId: unknown.id });
    expect(withUnknown?.warnings.map((w) => w.code)).toContain('RAIN_PROTECTION_UNKNOWN');
    expect(out[0]?.assumptions.some((a) => a.code === 'RAIN_UNKNOWN')).toBe(false);
  });

  it('a_cold_sensitive_user_gets_warmer_clothes_than_a_warm_running_one', () => {
    const tops = ['LIGHT', 'MEDIUM', 'WARM'].map((warmth) => g({ categoryCode: 'TOPS', subtypeCode: 'SHIRT', warmth, layering: 'BASE' }));
    const rest = [g({ categoryCode: 'BOTTOMS', subtypeCode: 'JEANS' }), g({ categoryCode: 'FOOTWEAR', subtypeCode: 'SNEAKERS' })];
    const warmthOf = (comfort: 'COLD' | 'WARM') => {
      const top = recommend(base([...tops, ...rest], { weather: sum({ feelsAvgC: 22 }), comfort }), 1)[0]?.items.find((i) => i.role === 'TOP');
      return tops.find((t) => t.id === top?.garmentId)?.warmth;
    };
    expect(warmthOf('COLD')).toBe('WARM');
    expect(warmthOf('WARM')).toBe('MEDIUM');
  });

  it('recently_worn_ranks_lower_but_is_never_excluded', () => {
    const a = g({ categoryCode: 'TOPS', subtypeCode: 'SHIRT' });
    const b = g({ categoryCode: 'TOPS', subtypeCode: 'POLO' });
    const rest = [g({ categoryCode: 'BOTTOMS', subtypeCode: 'JEANS' }), g({ categoryCode: 'FOOTWEAR', subtypeCode: 'SNEAKERS' })];
    const out = recommend(base([a, b, ...rest], { weather: sum({ feelsAvgC: 21 }), daysSinceWorn: new Map([[a.id, 1]]) }), 3);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out[0]?.items.map((i) => i.garmentId)).toContain(b.id);
    expect(out.some((p) => p.items.some((i) => i.garmentId === a.id))).toBe(true);
  });

  it('layers_are_coherent_a_mid_layer_only_over_a_base_layer', () => {
    const w = [g({ categoryCode: 'TOPS', subtypeCode: 'TSHIRT' }), g({ categoryCode: 'KNITWEAR', subtypeCode: 'SWEATER' }), g({ categoryCode: 'BOTTOMS', subtypeCode: 'JEANS' }), g({ categoryCode: 'FOOTWEAR', subtypeCode: 'BOOTS' }), g({ categoryCode: 'OUTERWEAR', subtypeCode: 'COAT', warmth: 'WARM' })];
    const out = recommend(base(w, { weather: sum({ feelsAvgC: 3, tempAvgC: 4 }) }), 3);
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) {
      expect(p.items.some((i) => i.role === 'OUTERWEAR')).toBe(true);
      const tops = p.items.filter((i) => i.role === 'TOP');
      if (tops.length === 2) expect(tops.map((t) => w.find((x) => x.id === t.garmentId)?.categoryCode).sort()).toEqual(['KNITWEAR', 'TOPS']);
    }
  });

  it('personalization_only_when_taste_is_provided', () => {
    const tops = [g({ categoryCode: 'TOPS', subtypeCode: 'SHIRT' }), g({ categoryCode: 'TOPS', subtypeCode: 'POLO' })];
    const rest = [g({ categoryCode: 'BOTTOMS', subtypeCode: 'JEANS' }), g({ categoryCode: 'FOOTWEAR', subtypeCode: 'SNEAKERS' })];
    const input = base([...tops, ...rest], { weather: sum({ feelsAvgC: 21 }) });
    const plain = recommend(input, 2).map((p) => p.fingerprint);
    const taste = { acceptedGarments: new Map([[tops[1]!.id, 3]]), rejectedFingerprints: new Set<string>(), rejectedGarments: new Map([[tops[0]!.id, 3]]) };
    const liked = recommend({ ...input, taste }, 1)[0];
    expect(liked?.items.map((i) => i.garmentId)).toContain(tops[1]!.id);
    expect(recommend(input, 2).map((p) => p.fingerprint)).toEqual(plain); // deterministic without taste
  });
});

describe('weather maths', () => {
  const hours: Hour[] = Array.from({ length: 24 }, (_, hour) => ({ hour, tempC: hour, feelsLikeC: hour - 1, precipProbability: hour * 2, windKph: hour, reliability: hour === 10 ? 'LOW' : 'HIGH' }));
  it('summarize_window_and_empty_window', () => {
    expect(summarize(hours, 8, 12)).toMatchObject({ hours: 5, tempAvgC: 10, feelsAvgC: 9, precipMax: 24, windMax: 12, reliability: 'LOW' });
    expect(summarize([], 8, 12)).toBeNull();
    expect(summarize(hours, 30, 31)).toBeNull();
  });
  it('impact_thresholds_are_fixed_at_5C_30pts_20kph', () => {
    const a = sum({ tempAvgC: 15, precipMax: 10, windMax: 10 });
    expect(compareWeather(a, sum({ tempAvgC: 10.1, precipMax: 39, windMax: 29 })).warnings).toEqual([]);
    const c = compareWeather(a, sum({ tempAvgC: 10, precipMax: 40, windMax: 30 }));
    expect(c.warnings).toEqual(['TEMP_DROP', 'PRECIP_INCREASE', 'WIND_INCREASE']);
    expect(c.suggestions).toEqual(['ADD_WARMER_LAYER', 'ADD_OUTERWEAR', 'ADD_RAIN_PROTECTION', 'ADD_WINDPROOF_LAYER', 'REQUEST_NEW_RECOMMENDATION']);
    expect(compareWeather(a, sum({ tempAvgC: 20 })).warnings).toEqual(['TEMP_RISE']);
  });
});
