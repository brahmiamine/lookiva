import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import type { SessionHandler } from '@/modules/identity';
import type { Clock } from '@/platform/clock/port';
import type { RateLimiter } from '@/platform/rate-limit';
import { AppError } from '@/platform/http/errors';
import { wardrobeStats } from '../domain/stats';
import { readStats } from '../infrastructure/reader';
export const statsQuery = z.strictObject({ from: z.iso.date().default('2000-01-01'), to: z.iso.date().optional(), forgottenDays: z.coerce.number().int().min(1).max(3650).default(90) }).refine(v => !v.to || v.to >= v.from, 'Invalid date window');
export function createAnalyticsHttp(d: {
    db: PrismaClient;
    clock: Clock;
    limiter: RateLimiter;
    withSession: (h: SessionHandler) => (r: Request) => Promise<Response>;
}) {
    return d.withSession(async (req, ctx) => { await d.limiter.consume({ name: 'analytics:user', max: 30, windowMs: 60000 }, `user:${ctx.userId}`, d.clock.now()); const q = statsQuery.parse(Object.fromEntries(new URL(req.url).searchParams)); const today = d.clock.now().toISOString().slice(0, 10); if (q.from > (q.to ?? today) || (q.to ?? today) > today)
        throw new AppError('VALIDATION_ERROR', 400, 'Invalid date window'); const source = await readStats(d.db, ctx.userId); const result = wardrobeStats(source.garments, source.wears, { ...q, to: q.to ?? d.clock.now().toISOString().slice(0, 10), now: d.clock.now() }); return Response.json({ ...result, items: result.items.map(i => ({ ...i, name: source.garments.find(g => g.id === i.id)?.name ?? null })), definition: 'CURRENT_NON_TRASHED_WITH_CONFIRMED_WEAR_IN_UTC_WINDOW', spendingDefinition: 'ELIGIBLE_CURRENT_INVENTORY_PURCHASE_TOTALS' }); });
}
