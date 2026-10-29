// Pure weather maths: window summary and the fixed-threshold comparison used by "weather impact". No I/O.
export type Hour = { hour: number; tempC: number; feelsLikeC: number; precipProbability: number; windKph: number; reliability: 'HIGH' | 'MEDIUM' | 'LOW' };
export type WeatherSummary = {
  hours: number;
  tempAvgC: number;
  feelsAvgC: number;
  feelsMinC: number;
  feelsMaxC: number;
  precipMax: number;
  windMax: number;
  /** Worst reliability of the window. */
  reliability: Hour['reliability'];
};

/** Fixed, documented impact thresholds (plans/06 T11). */
export const IMPACT_THRESHOLDS = { tempC: 5, precipPoints: 30, windKph: 20 } as const;
/** "Rain" and "windy" levels used by the engine. */
export const RAIN_PROBABILITY = 50;
export const WINDY_KPH = 40;

const RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Summary of the hours in [from, to] (inclusive local hours); null when the window holds no data. */
export function summarize(hours: readonly Hour[], from: number, to: number): WeatherSummary | null {
  const w = hours.filter((h) => h.hour >= from && h.hour <= to);
  if (!w.length) return null;
  return {
    hours: w.length,
    tempAvgC: r1(avg(w.map((h) => h.tempC))),
    feelsAvgC: r1(avg(w.map((h) => h.feelsLikeC))),
    feelsMinC: Math.min(...w.map((h) => h.feelsLikeC)),
    feelsMaxC: Math.max(...w.map((h) => h.feelsLikeC)),
    precipMax: Math.max(...w.map((h) => h.precipProbability)),
    windMax: Math.max(...w.map((h) => h.windKph)),
    reliability: w.reduce<Hour['reliability']>((worst, h) => (RANK[h.reliability] > RANK[worst] ? h.reliability : worst), 'HIGH'),
  };
}

export type ImpactChange = { metric: 'TEMPERATURE' | 'PRECIPITATION' | 'WIND'; before: number; after: number; delta: number; threshold: number };
export type ImpactWarning = 'TEMP_DROP' | 'TEMP_RISE' | 'PRECIP_INCREASE' | 'PRECIP_DECREASE' | 'WIND_INCREASE' | 'WIND_DECREASE';
export type ImpactSuggestion = 'ADD_WARMER_LAYER' | 'ADD_OUTERWEAR' | 'LIGHTER_LAYERS' | 'ADD_RAIN_PROTECTION' | 'ADD_WINDPROOF_LAYER' | 'REQUEST_NEW_RECOMMENDATION';

/** Compares two summaries with the fixed thresholds. Only describes; nothing here (or in callers) replaces an outfit. */
export function compareWeather(before: WeatherSummary, after: WeatherSummary): { changes: ImpactChange[]; warnings: ImpactWarning[]; suggestions: ImpactSuggestion[] } {
  const t = IMPACT_THRESHOLDS;
  const changes: ImpactChange[] = [];
  const warnings: ImpactWarning[] = [];
  const suggestions = new Set<ImpactSuggestion>();
  const check = (metric: ImpactChange['metric'], b: number, a: number, threshold: number, up: ImpactWarning, down: ImpactWarning, upSug: ImpactSuggestion[], downSug: ImpactSuggestion[]) => {
    const delta = r1(a - b);
    if (Math.abs(delta) < threshold) return;
    changes.push({ metric, before: b, after: a, delta, threshold });
    warnings.push(delta > 0 ? up : down);
    for (const s of delta > 0 ? upSug : downSug) suggestions.add(s);
  };
  check('TEMPERATURE', before.tempAvgC, after.tempAvgC, t.tempC, 'TEMP_RISE', 'TEMP_DROP', ['LIGHTER_LAYERS'], ['ADD_WARMER_LAYER', 'ADD_OUTERWEAR']);
  check('PRECIPITATION', before.precipMax, after.precipMax, t.precipPoints, 'PRECIP_INCREASE', 'PRECIP_DECREASE', ['ADD_RAIN_PROTECTION'], []);
  check('WIND', before.windMax, after.windMax, t.windKph, 'WIND_INCREASE', 'WIND_DECREASE', ['ADD_WINDPROOF_LAYER'], []);
  if (warnings.length) suggestions.add('REQUEST_NEW_RECOMMENDATION');
  return { changes, warnings, suggestions: [...suggestions] };
}
