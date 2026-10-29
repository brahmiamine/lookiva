import { randomUUID } from 'node:crypto';
import type { Clock } from '@/platform/clock/port';
import type { Geocoder } from '@/platform/geocoder/port';
import type { WeatherProvider } from '@/platform/weather/port';
import { summarize, type Hour, type WeatherSummary } from '../domain/weather';
import type { Counter, WeatherStore } from './ports';

export type Place = { latitude: number; longitude: number; timezone: string; label: string };
export type PlaceInput = { cityName: string | null; latitude: number | null; longitude: number | null; timezone: string | null };
export type Unavailable = 'NO_PROVIDER' | 'NO_LOCATION' | 'CITY_NOT_FOUND' | 'QUOTA' | 'TIMEOUT' | 'PROVIDER_ERROR' | 'NO_DATA';
export type DayWeather = { ok: true; place: Place; source: 'CACHE' | 'PROVIDER'; provider: string; issuedAt: Date; hours: Hour[] } | { ok: false; reason: Unavailable; place?: Place };
export type WeatherConfig = { ttlMs: number; dailyCallCap: number; timeoutMs: number };
export const DEFAULT_WEATHER_CONFIG: WeatherConfig = { ttlMs: 30 * 60_000, dailyCallCap: 1000, timeoutMs: 4000 };

export const locationKey = (lat: number, lon: number): string => `${lat.toFixed(2)},${lon.toFixed(2)}`;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
/** Keeps only well-formed hours: a provider can never push garbage into the cache. */
const clean = (hours: unknown): Hour[] =>
  (Array.isArray(hours) ? hours : []).flatMap((h) =>
    finite(h?.hour) && finite(h?.tempC) && finite(h?.feelsLikeC) && finite(h?.precipProbability) && finite(h?.windKph) && ['HIGH', 'MEDIUM', 'LOW'].includes(h?.reliability)
      ? [{ hour: h.hour, tempC: h.tempC, feelsLikeC: h.feelsLikeC, precipProbability: Math.min(100, Math.max(0, h.precipProbability)), windKph: Math.max(0, h.windKph), reliability: h.reliability }]
      : [],
  );

export function createWeatherService(deps: { provider: WeatherProvider | null; store: WeatherStore; geocoder: Geocoder; counter: Counter; clock: Clock; config?: Partial<WeatherConfig>; log?: (msg: string, data: object) => void }) {
  const cfg = { ...DEFAULT_WEATHER_CONFIG, ...deps.config };
  const { clock } = deps;
  const log = deps.log ?? (() => undefined);

  /** Profile place by default, per-request override by city name (geocoded). Never guesses: unknown => null. */
  async function resolvePlace(profile: PlaceInput, cityOverride?: string): Promise<{ place: Place } | { reason: 'NO_LOCATION' | 'CITY_NOT_FOUND' }> {
    const name = cityOverride?.trim() || null;
    if (!name && profile.latitude !== null && profile.longitude !== null && profile.timezone) {
      return { place: { latitude: profile.latitude, longitude: profile.longitude, timezone: profile.timezone, label: profile.cityName ?? '' } };
    }
    const query = name ?? profile.cityName;
    if (!query) return { reason: 'NO_LOCATION' };
    const [c] = await deps.geocoder.search(query, 'en');
    if (!c) return { reason: name ? 'CITY_NOT_FOUND' : 'NO_LOCATION' };
    return { place: { latitude: c.latitude, longitude: c.longitude, timezone: profile.timezone && !name ? profile.timezone : c.timezone, label: c.name } };
  }

  /** Cached (TTL) or fresh forecast of one local day, behind a provider-call quota and a timeout. Failure => ok:false, never invented data. */
  async function day(place: Place, localDate: string): Promise<DayWeather> {
    const key = locationKey(place.latitude, place.longitude);
    const now = clock.now();
    const hit = await deps.store.latest(key, localDate, new Date(now.getTime() - cfg.ttlMs));
    if (hit) return { ok: true, place, source: 'CACHE', provider: hit.provider, issuedAt: hit.issuedAt, hours: hit.hours };
    if (!deps.provider) return { ok: false, reason: 'NO_PROVIDER', place };
    const used = await deps.counter.incr(`weather-calls:${now.toISOString().slice(0, 10)}`, 2 * 86_400);
    if (used > cfg.dailyCallCap) {
      log('weather provider quota reached', { used, cap: cfg.dailyCallCap });
      return { ok: false, reason: 'QUOTA', place };
    }
    let timer: NodeJS.Timeout | undefined;
    try {
      const f = await Promise.race([
        deps.provider.forecast({ latitude: place.latitude, longitude: place.longitude, timezone: place.timezone, date: localDate }),
        new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('TIMEOUT')), cfg.timeoutMs); }),
      ]);
      const hours = clean(f?.hours);
      if (!hours.length) return { ok: false, reason: 'NO_DATA', place };
      const issuedAt = f.issuedAt instanceof Date && !Number.isNaN(f.issuedAt.getTime()) ? f.issuedAt : now;
      await deps.store.save({ id: randomUUID(), locationKey: key, localDate, provider: String(f.provider).slice(0, 32), issuedAt, fetchedAt: now, timezone: place.timezone, hours });
      void deps.store.purge(new Date(now.getTime() - 7 * 86_400_000)).catch(() => undefined);
      return { ok: true, place, source: 'PROVIDER', provider: String(f.provider).slice(0, 32), issuedAt, hours };
    } catch (e) {
      log('weather provider failed', { reason: (e as Error).message === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR' });
      return { ok: false, reason: (e as Error).message === 'TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_ERROR', place };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Place + day + window in one call. */
  async function forWindow(profile: PlaceInput, o: { date: string; from: number; to: number; cityOverride?: string }) {
    const p = await resolvePlace(profile, o.cityOverride);
    if (!('place' in p)) return { ok: false as const, reason: p.reason };
    const d = await day(p.place, o.date);
    if (!d.ok) return d;
    const summary = summarize(d.hours, o.from, o.to);
    return summary ? { ...d, summary, window: d.hours.filter((h) => h.hour >= o.from && h.hour <= o.to) } : { ok: false as const, reason: 'NO_DATA' as const, place: d.place };
  }
  return { resolvePlace, day, forWindow };
}
export type WeatherService = ReturnType<typeof createWeatherService>;
export type WindowWeather = Extract<Awaited<ReturnType<WeatherService['forWindow']>>, { ok: true }> & { summary: WeatherSummary };
