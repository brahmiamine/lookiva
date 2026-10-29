import { Redis } from 'ioredis';
import type { PrismaClient } from '@/generated/prisma/client';
import { FakeRecommendationAi } from '@/platform/ai/fake-recommendation';
import { systemClock } from '@/platform/clock/system';
import { createDb } from '@/platform/db';
import { getEnv } from '@/platform/env';
import { FakeGeocoder } from '@/platform/geocoder/fake';
import { createLogger } from '@/platform/logger';
import { FakeWeather } from '@/platform/weather/fake';
import { createPreferencesReader, withSession } from '@/modules/identity';
import { createOutfitReader } from '@/modules/outfits';
import { createGarmentGateway } from '@/modules/wardrobe';
import { createRecommendationsHttp, type RecommendationsHttp } from './http';

const g = globalThis as typeof globalThis & { __lookivaReco?: RecommendationsHttp; __lookivaDb?: PrismaClient; __lookivaRedis?: Redis };

/** Process-wide recommendations API built from the environment on first use (never at import or build time). */
function reco(): RecommendationsHttp {
  if (g.__lookivaReco) return g.__lookivaReco;
  const env = getEnv();
  const logger = createLogger({ level: env.LOG_LEVEL });
  const db = (g.__lookivaDb ??= createDb(env.DATABASE_URL));
  if (!g.__lookivaRedis) {
    g.__lookivaRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
    g.__lookivaRedis.on('error', (err) => logger.error({ err }, 'redis error (recommendations)'));
  }
  return (g.__lookivaReco = createRecommendationsHttp({
    db, redis: g.__lookivaRedis, clock: systemClock, withSession,
    garments: createGarmentGateway(db, systemClock), preferences: createPreferencesReader(db), outfits: createOutfitReader(db),
    geocoder: new FakeGeocoder(), // ponytail: fake only; the real geocoder/weather/AI providers are owner decisions (ADR-10, runbook)
    weather: env.WEATHER_PROVIDER === 'fake' ? new FakeWeather() : null,
    ai: env.RECOMMENDATION_AI === 'fake' ? new FakeRecommendationAi('reverse') : null,
    config: {
      weather: { ttlMs: env.WEATHER_CACHE_TTL_MIN * 60_000, dailyCallCap: env.WEATHER_DAILY_CALL_CAP },
      reco: { aiDailyCap: env.AI_RECOMMENDATION_DAILY_CAP },
    },
  }));
}

type Route = (req: Request) => Promise<Response>;
type IdRoute = (req: Request, id: string) => Promise<Response>;
const lazy = (pick: (o: RecommendationsHttp) => Route): Route => (req) => pick(reco())(req);
const lazyId = (pick: (o: RecommendationsHttp) => IdRoute): IdRoute => (req, id) => pick(reco())(req, id);

/** Handlers for the thin route files under src/app/api/v1. */
export const recommendationsRoutes = {
  getWeather: lazy((o) => o.getWeather),
  recommendOutfits: lazy((o) => o.recommendOutfits),
  addFeedback: lazy((o) => o.addFeedback),
  deleteAllFeedback: lazy((o) => o.deleteAllFeedback),
  deleteFeedback: lazyId((o) => o.deleteFeedback),
  weatherImpact: lazyId((o) => o.weatherImpact),
  setWeatherBaseline: lazyId((o) => o.setWeatherBaseline),
};
