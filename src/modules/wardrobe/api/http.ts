import type { PrismaClient } from '@/generated/prisma/client';
import type { Redis } from 'ioredis';
import type { Clock } from '@/platform/clock/port';
import { readJson } from '@/platform/http/body';
import { etagFor } from '@/platform/http/etag';
import { withIdempotency } from '@/platform/http/idempotency';
import { canonicalJson, readIdempotencyKey, requestHash } from '@/platform/http/idempotency-key';
import { parsePage } from '@/platform/http/pagination';
import { withApi } from '@/platform/http/with-api';
import { createRateLimiter, type Limit } from '@/platform/rate-limit';
import type { Logger } from '@/platform/logger';
import type { BackgroundRemover } from '@/platform/background-remover/port';
import type { ObjectStorage } from '@/platform/storage/objects';
import { createPhotoService } from '../application/photo-service';
import { createWardrobeService } from '../application/service';
import { CATEGORIES, COLORS, SEASONS, SHADES, STYLES } from '../domain/catalog';
import { WEATHER_FIELDS } from '../domain/garment';
import { GARMENT_STATUSES, STATUS_LABELS, isRecommendable } from '../domain/status';
import { VARIANTS, type Variant } from '../domain/photo';
import { createPrismaPhotoStore } from '../infrastructure/prisma-photo-store';
import { createSharpProcessor } from '../infrastructure/sharp-processor';
import { readPhotoUpload } from './upload';
import { createPrismaCustomSubcategoryStore, createPrismaGarmentStore } from '../infrastructure/prisma-store';
import * as s from './schemas';

type SessionCtx = { requestId: string; log: Logger; userId: import('@/platform/kernel').OwnerId; sessionId: string };
/** Identity's session guard (injected: modules only meet through their public API). */
export type WithSession = (handler: (req: Request, ctx: SessionCtx) => Promise<Response>) => (req: Request) => Promise<Response>;

export type WardrobeHttpDeps = { db: PrismaClient; redis: Redis; clock: Clock; withSession: WithSession; logger?: Logger; rateLimitPrefix?: string; storage: ObjectStorage; remover: BackgroundRemover };

const MIN = 60_000;
export const LIMITS = { write: { name: 'wardrobe-write:user', max: 120, windowMs: MIN } } as const satisfies Record<string, Limit>;

const withEtag = <T extends { version: number }>(body: T, status = 200) => Response.json(body, { status, headers: { ETag: etagFor(body.version) } });
const queryOf = (req: Request) => new URL(req.url).searchParams;

export function createWardrobeHttp(deps: WardrobeHttpDeps) {
  const { db, clock } = deps;
  const limiter = createRateLimiter(deps.redis, deps.rateLimitPrefix);
  const garments = createPrismaGarmentStore(db);
  const svc = createWardrobeService({ garments, customs: createPrismaCustomSubcategoryStore(db), clock });
  const opts = { logger: deps.logger };
  const photoSvc = (log: Logger) =>
    createPhotoService({ photos: createPrismaPhotoStore(db), garments, storage: deps.storage, processor: createSharpProcessor(), remover: deps.remover, clock, log });

  /** Per-user write budget, spent before the body is parsed. */
  const write = (handler: Parameters<WithSession>[0]) =>
    deps.withSession(async (req, ctx) => {
      await limiter.consume(LIMITS.write, `user:${ctx.userId}`, clock.now());
      return handler(req, ctx);
    });
  const read = deps.withSession;

  return {
    /** Application service for in-process callers (duplication, tests). */
    photoService: photoSvc,
    catalogCategories: withApi(async () => Response.json({ items: CATEGORIES }), opts),
    catalogColors: withApi(async () => Response.json({ items: COLORS, shades: SHADES }), opts),
    catalogOptions: withApi(
      async () =>
        Response.json({
          statuses: GARMENT_STATUSES.map((code) => ({ code, recommendable: isRecommendable(code), labels: STATUS_LABELS[code] })),
          seasons: SEASONS,
          styles: STYLES,
          weather: WEATHER_FIELDS,
        }),
      opts,
    ),

    createGarment: write(async (req, ctx) => {
      const key = readIdempotencyKey(req);
      const body = await readJson(req, s.garmentCreateBody);
      const r = await withIdempotency(
        db,
        { userId: ctx.userId, key, requestHash: requestHash(req.method, new URL(req.url).pathname, canonicalJson(body)) },
        async () => ({ status: 201, body: await svc.createGarment(ctx.userId, body) }),
        { onPersistError: (err) => ctx.log.error({ err }, 'idempotency result not persisted') },
      );
      return withEtag(r.body as { version: number }, r.status);
    }),

    listGarments: read(async (req, ctx) => {
      const q = queryOf(req);
      const filter = s.garmentListQuery.parse(Object.fromEntries(['category', 'subtype', 'color', 'season', 'style', 'status', 'q'].flatMap((k) => (q.has(k) ? [[k, q.get(k)]] : []))));
      return Response.json(await svc.listGarments(ctx.userId, parsePage(q), filter));
    }),

    getGarment: (req: Request, id: string) => read(async (_r, ctx) => withEtag(await svc.getGarment(ctx.userId, id)))(req),

    updateGarment: (req: Request, id: string) =>
      write(async (r, ctx) => {
        const patch = await readJson(r, s.garmentPatchBody);
        return withEtag(await svc.updateGarment(ctx.userId, id, r.headers.get('if-match'), patch));
      })(req),

    deleteGarment: (req: Request, id: string) =>
      write(async (_r, ctx) => {
        await svc.deleteGarment(ctx.userId, id);
        return new Response(null, { status: 204 });
      })(req),

    changeStatus: (req: Request, id: string) =>
      write(async (r, ctx) => {
        const b = await readJson(r, s.statusBody);
        return withEtag(await svc.changeStatus(ctx.userId, id, r.headers.get('if-match'), b.status, b.note));
      })(req),

    statusHistory: (req: Request, id: string) => read(async (r, ctx) => Response.json(await svc.statusHistory(ctx.userId, id, parsePage(queryOf(r)))))(req),

    listPhotos: (req: Request, id: string) => read(async (_r, ctx) => Response.json({ items: await photoSvc(ctx.log).list(ctx.userId, id) }))(req),

    uploadPhoto: (req: Request, id: string) =>
      write(async (r, ctx) => {
        const photos = photoSvc(ctx.log);
        await photos.assertCanUpload(ctx.userId, id); // before the body is read
        return Response.json(await photos.upload(ctx.userId, id, await readPhotoUpload(r)), { status: 201 });
      })(req),

    setPrimaryPhoto: (req: Request, id: string, photoId: string) =>
      write(async (_r, ctx) => Response.json(await photoSvc(ctx.log).setPrimary(ctx.userId, id, photoId)))(req),

    deletePhoto: (req: Request, id: string, photoId: string) =>
      write(async (_r, ctx) => {
        await photoSvc(ctx.log).remove(ctx.userId, id, photoId);
        return new Response(null, { status: 204 });
      })(req),

    cutoutPhoto: (req: Request, id: string, photoId: string) =>
      write(async (_r, ctx) => Response.json(await photoSvc(ctx.log).cutout(ctx.userId, id, photoId)))(req),

    photoFile: (req: Request, id: string, photoId: string) =>
      read(async (r, ctx) => {
        const v = queryOf(r).get('variant') ?? 'optimized';
        if (!(VARIANTS as readonly string[]).includes(v)) throw s.invalidVariant();
        const f = await photoSvc(ctx.log).file(ctx.userId, id, photoId, v as Variant);
        // Private bytes for the session owner only: no public/durable URL, never cached, never sniffed.
        return new Response(f.body, {
          headers: { 'Content-Type': f.contentType, 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' },
        });
      })(req),

    createCustomSubcategory: write(async (req, ctx) => withEtag(await svc.createCustom(ctx.userId, await readJson(req, s.customCreateBody)), 201)),

    listCustomSubcategories: read(async (req, ctx) => Response.json(await svc.listCustoms(ctx.userId, parsePage(queryOf(req))))),

    updateCustomSubcategory: (req: Request, id: string) =>
      write(async (r, ctx) => {
        const { label } = await readJson(r, s.customPatchBody);
        return withEtag(await svc.renameCustom(ctx.userId, id, r.headers.get('if-match'), label));
      })(req),

    deleteCustomSubcategory: (req: Request, id: string) =>
      write(async (r, ctx) => {
        const { reassignTo } = s.customDeleteQuery.parse({ reassignTo: queryOf(r).get('reassignTo') ?? undefined });
        await svc.deleteCustom(ctx.userId, id, reassignTo ?? null);
        return new Response(null, { status: 204 });
      })(req),
  };
}
export type WardrobeHttp = ReturnType<typeof createWardrobeHttp>;
