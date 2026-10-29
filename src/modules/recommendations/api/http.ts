import type { Redis } from 'ioredis';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { OptionalRecommendationAI } from '@/platform/ai/recommendation';
import type { Clock } from '@/platform/clock/port';
import type { Geocoder } from '@/platform/geocoder/port';
import type { WeatherProvider } from '@/platform/weather/port';
import { AppError } from '@/platform/http/errors';
import { readJson } from '@/platform/http/body';
import { withIdempotency } from '@/platform/http/idempotency';
import { canonicalJson, readIdempotencyKey, requestHash } from '@/platform/http/idempotency-key';
import type { Logger } from '@/platform/logger';
import type { OwnerId } from '@/platform/kernel';
import { createRateLimiter, type Limit } from '@/platform/rate-limit';
import type { GarmentGateway } from '@/modules/wardrobe';
import type { OutfitReader } from '@/modules/outfits';
import type { PreferencesReader } from '@/modules/identity';
import { createPrismaBaselineStore, createPrismaFeedbackStore, createPrismaSessionStore, createPrismaWeatherStore, createRedisCounter } from '../infrastructure/prisma-store';
import { createRecommendationService, type RecoConfig } from '../application/service';
import { createWeatherService, type WeatherConfig } from '../application/weather-service';
import * as s from './schemas';

type SessionCtx = { requestId: string; log: Logger; userId: OwnerId; sessionId: string };
export type WithSession = (handler: (req: Request, ctx: SessionCtx) => Promise<Response>) => (req: Request) => Promise<Response>;
export type RecommendationsHttpDeps = {
  db: PrismaClient; redis: Redis; clock: Clock; withSession: WithSession;
  garments: GarmentGateway; preferences: PreferencesReader; outfits: OutfitReader; geocoder: Geocoder;
  /** null = no provider configured: weather is reported unavailable, never invented. */
  weather: WeatherProvider | null;
  /** null = no AI configured: rules only. */
  ai: OptionalRecommendationAI | null;
  config?: { weather?: Partial<WeatherConfig>; reco?: Partial<RecoConfig> };
  rateLimitPrefix?: string;
};

const MIN = 60_000;
export const LIMITS = {
  recommend: { name: 'reco:user', max: 30, windowMs: MIN },
  weather: { name: 'weather:user', max: 60, windowMs: MIN },
  write: { name: 'reco-write:user', max: 120, windowMs: MIN },
} as const satisfies Record<string, Limit>;

const q = (req: Request) => Object.fromEntries(new URL(req.url).searchParams);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createRecommendationsHttp(deps: RecommendationsHttpDeps) {
  const { db, clock } = deps;
  const limiter = createRateLimiter(deps.redis, deps.rateLimitPrefix);
  const counter = createRedisCounter(deps.redis, deps.rateLimitPrefix ? `${deps.rateLimitPrefix}:cnt` : 'reco');
  const logOf = (log?: Logger) => (msg: string, data: object) => log?.info(data, msg);
  const svcFor = (log?: Logger) => {
    const weather = createWeatherService({ provider: deps.weather, store: createPrismaWeatherStore(db), geocoder: deps.geocoder, counter, clock, config: deps.config?.weather, log: logOf(log) });
    return createRecommendationService({
      garments: deps.garments, prefs: deps.preferences, wears: deps.outfits, outfits: deps.outfits, weather,
      sessions: createPrismaSessionStore(db), feedback: createPrismaFeedbackStore(db), baselines: createPrismaBaselineStore(db),
      counter, ai: deps.ai, clock, config: deps.config?.reco, log: logOf(log),
    });
  };
  const limited = (limit: Limit, handler: Parameters<WithSession>[0]) =>
    deps.withSession(async (req, ctx) => {
      await limiter.consume(limit, `user:${ctx.userId}`, clock.now());
      return handler(req, ctx);
    });
  const checkId = (id: string) => {
    if (!UUID_RE.test(id)) throw new AppError('NOT_FOUND', 404, 'Not found');
  };
  const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;
  const dateInRange = (date: string) => {
    const t = Date.parse(`${date}T00:00:00Z`);
    const today = Date.parse(`${clock.now().toISOString().slice(0, 10)}T00:00:00Z`);
    if (t < today - 2 * 86_400_000 || t > today + 16 * 86_400_000) throw new AppError('VALIDATION_ERROR', 400, 'Validation failed', [{ path: 'date', message: 'date must be within the forecast horizon (yesterday to 16 days ahead)' }]);
  };

  return {
    getWeather: limited(LIMITS.weather, async (req, ctx) => {
      const p = s.weatherQuery.parse(q(req));
      dateInRange(p.date);
      return Response.json(await svcFor(ctx.log).weatherFor(ctx.userId, { date: p.date, from: p.from ?? 8, to: p.to ?? 20, cityOverride: p.cityOverride }));
    }),

    recommendOutfits: limited(LIMITS.recommend, async (req, ctx) => {
      const b = await readJson(req, s.recommendBody);
      dateInRange(b.date);
      return Response.json(await svcFor(ctx.log).propose(ctx.userId, { ...b, from: b.from ?? 8, to: b.to ?? 20 }));
    }),

    addFeedback: limited(LIMITS.write, async (req, ctx) => {
      const key = readIdempotencyKey(req);
      const body = await readJson(req, s.feedbackBody);
      const r = await withIdempotency(
        db,
        { userId: ctx.userId, key, requestHash: requestHash(req.method, new URL(req.url).pathname, canonicalJson(body)) },
        async () => ({ status: 201, body: json(await svcFor(ctx.log).addFeedback(ctx.userId, body)) }),
        { onPersistError: (err) => ctx.log.error({ err }, 'idempotency result not persisted') },
      );
      return Response.json(r.body, { status: r.status });
    }),

    deleteAllFeedback: limited(LIMITS.write, async (_req, ctx) => Response.json({ deleted: await svcFor(ctx.log).removeAllFeedback(ctx.userId) })),

    deleteFeedback: (req: Request, id: string) =>
      limited(LIMITS.write, async (_r, ctx) => {
        checkId(id);
        if (!(await svcFor(ctx.log).removeFeedback(ctx.userId, id))) throw new AppError('NOT_FOUND', 404, 'Feedback not found');
        return new Response(null, { status: 204 });
      })(req),

    weatherImpact: (req: Request, id: string) =>
      limited(LIMITS.weather, async (_r, ctx) => Response.json(await svcFor(ctx.log).impact(ctx.userId, id)))(req),

    setWeatherBaseline: (req: Request, id: string) =>
      limited(LIMITS.write, async (r, ctx) => Response.json(await svcFor(ctx.log).setBaseline(ctx.userId, id, (await readJson(r, s.baselineBody)).cityOverride)))(req),
  };
}
export type RecommendationsHttp = ReturnType<typeof createRecommendationsHttp>;
