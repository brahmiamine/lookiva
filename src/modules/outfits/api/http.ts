import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { Redis } from 'ioredis';
import type { GarmentGateway } from '@/modules/wardrobe';
import type { Clock } from '@/platform/clock/port';
import { AppError } from '@/platform/http/errors';
import { readJson } from '@/platform/http/body';
import { withIdempotency } from '@/platform/http/idempotency';
import { canonicalJson, readIdempotencyKey, requestHash } from '@/platform/http/idempotency-key';
import { etagFor } from '@/platform/http/etag';
import { parsePage } from '@/platform/http/pagination';
import type { Logger } from '@/platform/logger';
import type { OwnerId } from '@/platform/kernel';
import { createRateLimiter, type Limit } from '@/platform/rate-limit';
import { createOutfitService } from '../application/service';
import { createPrismaOutfitStore, createPrismaTemplateStore, createPrismaWearStore } from '../infrastructure/prisma-store';
import * as s from './schemas';

type SessionCtx = { requestId: string; log: Logger; userId: OwnerId; sessionId: string };
/** Identity's session guard (injected: modules only meet through their public API). */
export type WithSession = (handler: (req: Request, ctx: SessionCtx) => Promise<Response>) => (req: Request) => Promise<Response>;
export type OutfitsHttpDeps = { db: PrismaClient; redis: Redis; clock: Clock; withSession: WithSession; garments: GarmentGateway; rateLimitPrefix?: string };

const MIN = 60_000;
export const LIMITS = { write: { name: 'outfits-write:user', max: 120, windowMs: MIN } } as const satisfies Record<string, Limit>;

const queryOf = (req: Request) => new URL(req.url).searchParams;
const etagged = <T extends { version: number }>(body: T, status = 200) => Response.json(body, { status, headers: { ETag: etagFor(body.version) } });

export function createOutfitsHttp(deps: OutfitsHttpDeps) {
  const { db, clock } = deps;
  const limiter = createRateLimiter(deps.redis, deps.rateLimitPrefix);
  const svc = createOutfitService({ outfits: createPrismaOutfitStore(db), wears: createPrismaWearStore(db), templates: createPrismaTemplateStore(db), garments: deps.garments, clock });

  const read = deps.withSession;
  const write = (handler: Parameters<WithSession>[0]) =>
    deps.withSession(async (req, ctx) => {
      await limiter.consume(LIMITS.write, `user:${ctx.userId}`, clock.now());
      return handler(req, ctx);
    });
  /** Runs `fn` once per (user, key): a replay returns the stored result, a distinct key runs again. */
  const once = <T extends Prisma.InputJsonValue>(ctx: SessionCtx, req: Request, key: string, body: unknown, fn: () => Promise<{ status: number; body: T }>) =>
    withIdempotency(
      db,
      { userId: ctx.userId, key, requestHash: requestHash(req.method, new URL(req.url).pathname, canonicalJson(body)) },
      fn,
      { onPersistError: (err) => ctx.log.error({ err }, 'idempotency result not persisted') },
    );
  const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

  return {
    createOutfit: write(async (req, ctx) => {
      const key = readIdempotencyKey(req);
      const body = await readJson(req, s.outfitCreateBody);
      const r = await once(ctx, req, key, body, async () => ({ status: 201, body: json(await svc.create(ctx.userId, body)) }));
      return etagged(r.body as { version: number }, r.status);
    }),

    listOutfits: read(async (req, ctx) => {
      const q = queryOf(req);
      const f = s.outfitListQuery.parse(Object.fromEntries(['status', 'from', 'to'].flatMap((k) => (q.has(k) ? [[k, q.get(k)]] : []))));
      if (f.from && f.to) {
        if (f.from > f.to) throw new AppError('VALIDATION_ERROR', 400, 'Validation failed', [{ path: 'to', message: 'to must not be before from' }]);
        return Response.json(await svc.range(ctx.userId, f.from, f.to, f.status));
      }
      return Response.json(await svc.list(ctx.userId, parsePage(q), f.status));
    }),

    getOutfit: (req: Request, id: string) => read(async (_r, ctx) => etagged(await svc.get(ctx.userId, id)))(req),

    patchOutfit: (req: Request, id: string) =>
      write(async (r, ctx) => etagged(await svc.patch(ctx.userId, id, r.headers.get('if-match'), await readJson(r, s.outfitPatchBody))))(req),

    cancelOutfit: (req: Request, id: string) =>
      write(async (_r, ctx) => {
        await svc.cancel(ctx.userId, id, _r.headers.get('if-match'));
        return new Response(null, { status: 204 });
      })(req),

    addItem: (req: Request, id: string) => write(async (r, ctx) => etagged(await svc.addItem(ctx.userId, id, r.headers.get('if-match'), await readJson(r, s.itemInput)), 201))(req),

    removeItem: (req: Request, id: string, garmentId: string) => write(async (r, ctx) => etagged(await svc.removeItem(ctx.userId, id, r.headers.get('if-match'), garmentId)))(req),

    replaceItem: (req: Request, id: string, garmentId: string) =>
      write(async (r, ctx) => etagged(await svc.replaceItem(ctx.userId, id, r.headers.get('if-match'), garmentId, await readJson(r, s.itemReplaceBody))))(req),

    conflicts: (req: Request, id: string) => read(async (_r, ctx) => Response.json(await svc.conflicts(ctx.userId, id)))(req),

    confirmWorn: (req: Request, id: string) =>
      write(async (r, ctx) => {
        const key = readIdempotencyKey(r);
        const body = await readJson(r, s.confirmBody);
        const res = await once(ctx, r, key, body, async () => {
          const { outfit, record } = await svc.confirmWorn(ctx.userId, id, body);
          return { status: 201, body: json({ outfit, wearRecord: record }) };
        });
        return Response.json(res.body, { status: res.status });
      })(req),

    lastWorn: read(async (req, ctx) => Response.json({ items: await svc.lastWorn(ctx.userId, s.limitQuery.parse({ limit: queryOf(req).get('limit') ?? undefined }).limit) })),

    garmentWearHistory: (req: Request, id: string) =>
      read(async (r, ctx) => Response.json({ items: await svc.garmentHistory(ctx.userId, id, s.limitQuery.parse({ limit: queryOf(r).get('limit') ?? undefined }).limit) }))(req),

    getWearRecord: (req: Request, id: string) => read(async (_r, ctx) => etagged(await svc.getWearRecord(ctx.userId, id)))(req),

    markToWash: (req: Request, id: string) =>
      write(async (r, ctx) => {
        const key = readIdempotencyKey(r);
        const body = await readJson(r, s.washBody);
        const res = await once(ctx, r, key, body, async () => ({ status: 200, body: json(await svc.markToWash(ctx.userId, id, body)) }));
        return Response.json(res.body, { status: res.status });
      })(req),

    invalidateWearRecord: (req: Request, id: string) =>
      write(async (r, ctx) => etagged(await svc.invalidate(ctx.userId, id, r.headers.get('if-match'), (await readJson(r, s.invalidateBody)).reason)))(req),

    createTemplate: write(async (req, ctx) => {
      const key = readIdempotencyKey(req);
      const body = await readJson(req, s.templateCreateBody);
      const r = await once(ctx, req, key, body, async () => ({ status: 201, body: json(await svc.createTemplate(ctx.userId, body)) }));
      return etagged(r.body as { version: number }, r.status);
    }),
    listTemplates: read(async (req, ctx) => Response.json(await svc.listTemplates(ctx.userId, parsePage(queryOf(req))))),
    getTemplate: (req: Request, id: string) => read(async (_r, ctx) => etagged(await svc.getTemplate(ctx.userId, id)))(req),
    patchTemplate: (req: Request, id: string) =>
      write(async (r, ctx) => etagged(await svc.patchTemplate(ctx.userId, id, r.headers.get('if-match'), await readJson(r, s.templatePatchBody))))(req),
    deleteTemplate: (req: Request, id: string) =>
      write(async (_r, ctx) => {
        await svc.removeTemplate(ctx.userId, id);
        return new Response(null, { status: 204 });
      })(req),
    instantiateTemplate: (req: Request, id: string) =>
      write(async (r, ctx) => {
        const key = readIdempotencyKey(r);
        const body = await readJson(r, s.instantiateBody);
        const res = await once(ctx, r, key, body, async () => ({ status: 201, body: json(await svc.instantiate(ctx.userId, id, body)) }));
        return etagged(res.body as { version: number }, res.status);
      })(req),
    saveAsTemplate: (req: Request, id: string) =>
      write(async (r, ctx) => {
        const key = readIdempotencyKey(r);
        const body = await readJson(r, s.saveAsTemplateBody);
        const res = await once(ctx, r, key, body, async () => ({ status: 201, body: json(await svc.saveAsTemplate(ctx.userId, id, body.name)) }));
        return etagged(res.body as { version: number }, res.status);
      })(req),
  };
}
export type OutfitsHttp = ReturnType<typeof createOutfitsHttp>;
