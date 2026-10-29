import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import type { SessionHandler } from '@/modules/identity';
import type { Clock } from '@/platform/clock/port';
import type { RateLimiter } from '@/platform/rate-limit';
import { AppError } from '@/platform/http/errors';
import { readJson } from '@/platform/http/body';
import { parsePage, encodeCursor } from '@/platform/http/pagination';
import { createNotificationService } from '../application/service';
export const preferenceBody = z.strictObject({ enabled: z.boolean(), minutesBefore: z.number().int().min(15).max(1440) });
export function createNotificationsHttp(d: {
    db: PrismaClient;
    clock: Clock;
    limiter: RateLimiter;
    withSession: (h: SessionHandler) => (r: Request) => Promise<Response>;
}) {
    const svc = createNotificationService(d.db);
    const wrap = (h: SessionHandler) => d.withSession(async (req, ctx) => { await d.limiter.consume({ name: 'notifications:user', max: 60, windowMs: 60000 }, `user:${ctx.userId}`, d.clock.now()); return h(req, ctx); });
    return {
        list: wrap(async (req, ctx) => { const page = parsePage(new URL(req.url).searchParams), r = await svc.list(ctx.userId, d.clock.now(), page.limit, page.cursor?.id); return Response.json({ items: r.rows, ...(r.last ? { nextCursor: encodeCursor({ id: r.last }) } : {}) }); }),
        refresh: wrap(async (_r, ctx) => Response.json(await svc.refresh(ctx.userId, d.clock.now()))),
        getPreferences: wrap(async (_r, ctx) => { const p = await d.db.notificationPreference.findUnique({ where: { ownerId: ctx.userId } }); return Response.json({ enabled: p?.enabled ?? false, minutesBefore: p?.minutesBefore ?? 60, pushAvailable: false }); }),
        setPreferences: wrap(async (req, ctx) => { const b = await readJson(req, preferenceBody); await d.db.notificationPreference.upsert({ where: { ownerId: ctx.userId }, create: { ownerId: ctx.userId, ...b }, update: b }); return Response.json({ ...b, pushAvailable: false }); }),
        read: (req: Request, id: string) => wrap(async (_r, ctx) => { if (!await svc.read(ctx.userId, id, d.clock.now()))
            throw new AppError('NOT_FOUND', 404, 'Notification not found'); return new Response(null, { status: 204 }); })(req),
        dismiss: (req: Request, id: string) => wrap(async (_r, ctx) => { if (!await svc.dismiss(ctx.userId, id, d.clock.now()))
            throw new AppError('NOT_FOUND', 404, 'Notification not found'); return new Response(null, { status: 204 }); })(req),
    };
}
