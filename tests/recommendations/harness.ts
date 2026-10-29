import { randomUUID } from 'node:crypto';
import { FakeRecommendationAi } from '@/platform/ai/fake-recommendation';
import { FakeGeocoder } from '@/platform/geocoder/fake';
import { FakeWeather } from '@/platform/weather/fake';
import { createPreferencesReader } from '@/modules/identity';
import { createOutfitReader } from '@/modules/outfits';
import { createRecommendationsHttp } from '@/modules/recommendations';
import { createGarmentGateway } from '@/modules/wardrobe';
import { closeAll, db, outfitsHarness, type Json } from '../outfits/harness';
import { harness as identityHarness, redis } from '../identity/harness';

export { closeAll, db };
export type { Json };

/** Outfits/wardrobe/identity harness (real sessions, db, redis) plus the recommendations API with fake weather + fake AI. */
export function recoHarness() {
  const h = outfitsHarness();
  const idh = identityHarness(); // identity API (the wardrobe harness shadows `api`); sessions live in the db so cookies are shared
  const weather = new FakeWeather('ok', undefined, () => h.clock.now());
  const ai = new FakeRecommendationAi('reverse');
  const http = createRecommendationsHttp({
    db, redis, clock: h.clock, withSession: h.withSession, garments: createGarmentGateway(db, h.clock),
    preferences: createPreferencesReader(db), outfits: createOutfitReader(db), geocoder: new FakeGeocoder(), weather, ai,
    config: { reco: { aiDailyCap: 2 } }, rateLimitPrefix: `rl-r-${randomUUID()}`,
  });
  const call = (handler: (r: Request) => Promise<Response>, path: string, cookie: string | undefined, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
    h.send(handler, h.request(path, { cookie, ...init }));
  const api = {
    weather: (c: string | undefined, q: string) => call(http.getWeather, `/weather${q}`, c),
    recommend: (c: string | undefined, body: unknown) => call(http.recommendOutfits, '/recommendations/outfits', c, { method: 'POST', body }),
    feedback: (c: string | undefined, body: unknown) => call(http.addFeedback, '/recommendations/feedback', c, { method: 'POST', body, headers: h.idem() }),
    delAll: (c: string | undefined) => call(http.deleteAllFeedback, '/recommendations/feedback', c, { method: 'DELETE' }),
    del: (c: string | undefined, id: string) => call((r) => http.deleteFeedback(r, id), `/recommendations/feedback/${id}`, c, { method: 'DELETE' }),
    baseline: (c: string | undefined, id: string, body: unknown = {}) => call((r) => http.setWeatherBaseline(r, id), `/outfits/${id}/weather-baseline`, c, { method: 'POST', body }),
    impact: (c: string | undefined, id: string) => call((r) => http.weatherImpact(r, id), `/outfits/${id}/weather-impact`, c),
  };
  return { ...h, ...api, idApi: idh.api, rweather: weather, rai: ai };
}
