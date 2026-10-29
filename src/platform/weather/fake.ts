import type { Weather, WeatherForecast, WeatherHour, WeatherQuery } from './port';

export type FakeWeatherMode = 'ok' | 'fail' | 'hang' | 'empty';
const hash = (s: string): number => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/**
 * Deterministic provider: the same place and day always give the same hours (seeded by rounded coordinates + date).
 * `mode` simulates failures; `calls` counts provider hits (quota/cache tests); `override` pins exact hours.
 */
export class FakeWeather implements Weather {
  calls = 0;
  constructor(public mode: FakeWeatherMode = 'ok', public override?: Partial<WeatherHour>, private now: () => Date = () => new Date()) {}

  async forecast(q: WeatherQuery): Promise<WeatherForecast> {
    this.calls++;
    if (this.mode === 'fail') throw new Error('fake weather provider failure');
    if (this.mode === 'hang') return new Promise<WeatherForecast>(() => undefined);
    const seed = hash(`${q.latitude.toFixed(2)},${q.longitude.toFixed(2)}|${q.date}`);
    const base = (seed % 30) - 4; // -4..25 C
    const rainy = (seed >> 3) % 3 === 0;
    const hours: WeatherHour[] =
      this.mode === 'empty'
        ? []
        : Array.from({ length: 24 }, (_, hour) => {
            const tempC = base + Math.round(6 * Math.sin(((hour - 9) / 24) * 2 * Math.PI));
            const wind = (seed >> 5) % 35;
            return {
              hour,
              tempC,
              feelsLikeC: tempC - Math.round(wind / 15),
              precipProbability: rainy ? 60 + (seed % 30) : seed % 20,
              windKph: wind,
              reliability: hour < 12 ? 'HIGH' : 'MEDIUM',
              ...this.override,
            } satisfies WeatherHour;
          });
    return { provider: 'fake', issuedAt: this.now(), hours };
  }
}
