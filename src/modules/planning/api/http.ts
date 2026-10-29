import type { PrismaClient, Prisma } from '@/generated/prisma/client';
import type { Redis } from 'ioredis';
import type { Clock } from '@/platform/clock/port';
import type { OwnerId } from '@/platform/kernel';
import type { SessionHandler } from '@/modules/identity';
import type { GarmentGateway } from '@/modules/wardrobe';
import { AppError } from '@/platform/http/errors';
import { assertIfMatch, etagFor } from '@/platform/http/etag';
import { readJson } from '@/platform/http/body';
import { parsePage, encodeCursor } from '@/platform/http/pagination';
import { canonicalJson, readIdempotencyKey, requestHash } from '@/platform/http/idempotency-key';
import { withIdempotency } from '@/platform/http/idempotency';
import { createRateLimiter } from '@/platform/rate-limit';
import type { Kind, Entry } from '../application/ports';
import { createPlanningStore } from '../infrastructure/store';
import { occurrenceDates, packingList } from '../domain/planning';
import { eventBody, tripBody, windowQuery } from './schemas';
type Deps = {
    db: PrismaClient;
    redis: Redis;
    clock: Clock;
    withSession: (h: SessionHandler) => (r: Request) => Promise<Response>;
    garments: GarmentGateway;
    rateLimitPrefix?: string;
};
export function createPlanningHttp(d: Deps) {
    const store = createPlanningStore(d.db), limiter = createRateLimiter(d.redis, d.rateLimitPrefix);
    const wrap = (h: SessionHandler) => d.withSession(async (req, ctx) => { await limiter.consume({ name: 'planning:user', max: 120, windowMs: 60000 }, `user:${ctx.userId}`, d.clock.now()); return h(req, ctx); });
    const find = async (owner: OwnerId, kind: Kind, id: string) => { const r = await store.get(owner, kind, id); if (!r)
        throw new AppError('NOT_FOUND', 404, 'Not found'); return r; };
    const json = (entry: Entry, status = 200) => Response.json(entry, { status, headers: { ETag: etagFor(entry.version) } });
    const validate = async (req: Request, _owner: OwnerId, kind: Kind) => kind === 'EVENT' ? readJson(req, eventBody) : readJson(req, tripBody);
    const checkGarments = async (owner: OwnerId, kind: Kind, payload: object, previous: string[] = []) => {
        if (kind !== 'TRIP')
            return;
        const ids = tripBody.parse(payload).garmentIds.filter(id => !previous.includes(id));
        const own = await d.garments.find(owner, ids);
        if (own.length !== ids.length || own.some(g => g.trashed))
            throw new AppError('NOT_FOUND', 404, 'Garment not found');
    };
    const resource = (kind: Kind) => ({
        list: wrap(async (req, ctx) => { const p = parsePage(new URL(req.url).searchParams); const rows = await store.list(ctx.userId, kind, p.limit + 1, p.cursor?.id); return Response.json({ items: rows.slice(0, p.limit), ...(rows.length > p.limit ? { nextCursor: encodeCursor({ id: rows[p.limit - 1]!.id }) } : {}) }); }),
        get: (req: Request, id: string) => wrap(async (_r, ctx) => json(await find(ctx.userId, kind, id)))(req),
        create: wrap(async (req, ctx) => {
            const key = readIdempotencyKey(req), payload = await validate(req, ctx.userId, kind);
            const r = await withIdempotency(d.db, { userId: ctx.userId, key, requestHash: requestHash(req.method, new URL(req.url).pathname, canonicalJson(payload)) }, async () => { await checkGarments(ctx.userId, kind, payload); return { status: 201, body: await store.create(ctx.userId, kind, payload, d.clock.now()) as unknown as Prisma.InputJsonValue }; }, { onPersistError: err => ctx.log.error({ err }, 'planning idempotency result not persisted') });
            return json(r.body as unknown as Entry, r.status);
        }),
        update: (req: Request, id: string) => wrap(async (r, ctx) => {
            const current = await find(ctx.userId, kind, id);
            assertIfMatch(r.headers.get('if-match'), current.version);
            const payload = await validate(r, ctx.userId, kind);
            await checkGarments(ctx.userId, kind, payload, kind === 'TRIP' ? tripBody.parse(current.payload).garmentIds : []);
            const next = await store.update(ctx.userId, kind, id, current.version, payload, d.clock.now());
            if (!next)
                throw new AppError('VERSION_CONFLICT', 409, 'Planning changed');
            return json(next);
        })(req),
        remove: (req: Request, id: string) => wrap(async (r, ctx) => { const current = await find(ctx.userId, kind, id); assertIfMatch(r.headers.get('if-match'), current.version); if (!await store.remove(ctx.userId, kind, id, current.version))
            throw new AppError('VERSION_CONFLICT', 409, 'Planning changed'); return new Response(null, { status: 204 }); })(req),
    });
    return { events: resource('EVENT'), trips: resource('TRIP'),
        occurrences: (req: Request, id: string) => wrap(async (r, ctx) => {
            const e = eventBody.parse((await find(ctx.userId, 'EVENT', id)).payload), w = windowQuery.parse(Object.fromEntries(new URL(r.url).searchParams));
            let dates: string[];
            try {
                dates = occurrenceDates(e.date, e.recurrence, w.from, w.to);
            }
            catch {
                throw new AppError('VALIDATION_ERROR', 400, 'Window must be at most 366 days');
            }
            return Response.json({ items: dates.map(date => ({ key: `${id}:${date}`, date, timezone: e.timezone, title: e.title, allDay: true })) });
        })(req),
        packing: (req: Request, id: string) => wrap(async (_r, ctx) => {
            const t = tripBody.parse((await find(ctx.userId, 'TRIP', id)).payload), own = await d.garments.find(ctx.userId, t.garmentIds);
            return Response.json({ ...packingList(t.garmentIds, t.maxPieces), warnings: t.garmentIds.flatMap(id => { const g = own.find(x => x.id === id); return !g || g.trashed ? [{ id, code: 'MISSING' }] : g.status !== 'AVAILABLE' ? [{ id, code: 'UNAVAILABLE' }] : []; }), checklist: t.checklist });
        })(req),
    };
}
