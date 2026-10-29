import type { PrismaClient } from '@/generated/prisma/client';
import type { Redis } from 'ioredis';
import type { Clock } from '@/platform/clock/port';
import { AppError } from '@/platform/http/errors';
import { readJson } from '@/platform/http/body';
import { withIdempotency } from '@/platform/http/idempotency';
import { canonicalJson, readIdempotencyKey, requestHash } from '@/platform/http/idempotency-key';
import { createRateLimiter } from '@/platform/rate-limit';
import type { Logger } from '@/platform/logger';
import type { OwnerId } from '@/platform/kernel';
import { createOutfitService, type ConfirmResult } from '../application/outfit-service';
import { createPrismaOutfitStore } from '../infrastructure/prisma-outfit-store';
import { createOutfitBody, outfitListQuery, outfitPatchBody } from './schemas';
import { withEtag } from './respond';
import { newId } from '@/platform/http/ids';

type SessionCtx = { requestId: string; log: Logger; userId: OwnerId; sessionId: string };
type WithSession = (handler: (req: Request, ctx: SessionCtx) => Promise<Response>) => (req: Request) => Promise<Response>;

export type OutfitHttpDeps = { db: PrismaClient; redis: Redis; clock: Clock; withSession: WithSession; rateLimitPrefix?: string };

/** Outfit routes: create (Idempotency-Key), read, and confirm-worn (Idempotency-Key). Every call is owner-scoped. */
export function createOutfitHttp({ db, redis, clock, withSession, rateLimitPrefix }: OutfitHttpDeps) {
  const service = createOutfitService({ outfits: createPrismaOutfitStore(db), now: () => clock.now(), newId });
  const limiter = createRateLimiter(redis, rateLimitPrefix);
  const write = (handler: Parameters<WithSession>[0]) =>
    withSession(async (req, ctx) => {
      await limiter.consume({ name: 'outfit-write:user', max: 120, windowMs: 60_000 }, `user:${ctx.userId}`, clock.now());
      return handler(req, ctx);
    });

  /** Map the outcome of a confirmation to HTTP. The stored answer is the same on a replay, refusals included. */
  const confirmation = (r: ConfirmResult) => {
    switch (r.kind) {
      case 'OK':
        return { status: 200, body: { outfit: r.outfit, wearRecordId: r.outfit.wearRecordId } };
      case 'NOT_FOUND':
        throw new AppError('NOT_FOUND', 404, 'outfit not found');
      case 'ALREADY_WORN':
        throw new AppError('OUTFIT_ALREADY_WORN', 409, 'this outfit was already confirmed as worn');
      case 'CANCELLED':
        throw new AppError('OUTFIT_CANCELLED', 409, 'a cancelled outfit cannot be worn');
      case 'GARMENT_UNAVAILABLE':
        throw new AppError('GARMENT_UNAVAILABLE', 409, 'some garments are in the trash', r.garmentIds.map((id) => ({ path: 'garmentIds', message: `garment ${id} is trashed` })));
    }
  };

  return {
    create: write(async (req, ctx) => {
      const key = readIdempotencyKey(req);
      const body = await readJson(req, createOutfitBody);
      const res = await withIdempotency(
        db,
        { userId: ctx.userId, key, requestHash: requestHash(req.method, new URL(req.url).pathname, canonicalJson(body)) },
        async () => ({ status: 201, body: await service.create(ctx.userId, body) }),
        { onPersistError: (err) => ctx.log.error({ err }, 'idempotency result not persisted') },
      );
      return Response.json(res.body, { status: res.status });
    }),

    get: (req: Request, id: string) => withSession(async (_r, ctx) => Response.json(await service.get(ctx.userId, id)))(req),

    /** Wear history of one garment (the last 20 confirmed wears). Another user's garment simply has no rows for this owner. */
    wears: (req: Request, id: string) => withSession(async (_r, ctx) => Response.json({ items: await service.wearsOf(ctx.userId, id) }))(req),

    /** Planning list: optional window on plannedFor and a status filter. Drafts without a date are included. */
    list: (req: Request) =>
      withSession(async (r, ctx) => {
        const p = new URL(r.url).searchParams;
        const f = outfitListQuery.parse(Object.fromEntries(['from', 'to', 'status'].flatMap((k) => (p.has(k) ? [[k, p.get(k)]] : []))));
        return Response.json({ items: await service.list(ctx.userId, { from: f.from ? new Date(f.from) : undefined, to: f.to ? new Date(f.to) : undefined, status: f.status }) });
      })(req),

    update: (req: Request, id: string) =>
      write(async (r, ctx) => {
        const body = await readJson(r, outfitPatchBody);
        return withEtag(await service.update(ctx.userId, id, r.headers.get('if-match'), body));
      })(req),

    confirmWorn: (req: Request, id: string) =>
      write(async (r, ctx) => {
        const key = readIdempotencyKey(r);
        const res = await withIdempotency(
          db,
          { userId: ctx.userId, key, requestHash: requestHash(r.method, new URL(r.url).pathname, '') },
          async () => ({ status: 200, body: await service.confirmWorn(ctx.userId, id) }),
          { onPersistError: (err) => ctx.log.error({ err }, 'idempotency result not persisted') },
        );
        const out = confirmation(res.body as ConfirmResult);
        return Response.json(out.body, { status: out.status });
      })(req),
  };
}
