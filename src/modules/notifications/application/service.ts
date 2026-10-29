import { createHash } from 'node:crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import type { OwnerId } from '@/platform/kernel';
import { AppError } from '@/platform/http/errors';
import { newId } from '@/platform/http/ids';
const valid = (n: {
    expiresAt: Date;
    startsAt: Date;
    outfit: {
        startsAt: Date | null;
        status: string;
        ownerId: string;
    };
}, owner: OwnerId, now: Date) => n.expiresAt > now && n.outfit.ownerId === owner && n.outfit.status === 'PLANNED' && n.outfit.startsAt?.getTime() === n.startsAt.getTime();
export function createNotificationService(db: PrismaClient) {
    return {
        async refresh(owner: OwnerId, now: Date) {
            await db.notification.deleteMany({ where: { ownerId: owner, expiresAt: { lte: now } } });
            const pref = await db.notificationPreference.findUnique({ where: { ownerId: owner } });
            if (!pref?.enabled)
                return { created: 0 };
            const outfits = await db.outfit.findMany({ where: { ownerId: owner, status: 'PLANNED', startsAt: { gt: now, lte: new Date(now.getTime() + pref.minutesBefore * 60000) } }, select: { id: true, startsAt: true }, take: 501 });
            if (outfits.length > 500)
                throw new AppError('NOTIFICATION_CAPACITY_EXCEEDED', 503, 'Too many upcoming outfits');
            let created = 0;
            for (const o of outfits) {
                const dedupeKey = createHash('sha256').update(`${o.id}:${o.startsAt!.toISOString()}`).digest('hex');
                const r = await db.notification.createMany({ data: [{ id: newId(), ownerId: owner, dedupeKey, outfitId: o.id, startsAt: o.startsAt!, createdAt: now, expiresAt: new Date(now.getTime() + 90 * 86400000) }], skipDuplicates: true });
                created += r.count;
            }
            return { created };
        },
        async list(owner: OwnerId, now: Date, limit: number, before?: string) {
            const rows = await db.notification.findMany({ where: { ownerId: owner, dismissedAt: null, expiresAt: { gt: now }, ...(before ? { id: { lt: before } } : {}) }, include: { outfit: { select: { startsAt: true, status: true, ownerId: true } } }, orderBy: { id: 'desc' }, take: limit + 1 });
            return { rows: rows.slice(0, limit).filter(n => valid(n, owner, now)).map(n => ({ id: n.id, code: 'OUTFIT_DUE' as const, outfitId: n.outfitId, startsAt: n.startsAt.toISOString(), readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() })), last: rows.length > limit ? rows[limit - 1]!.id : undefined };
        },
        async read(owner: OwnerId, id: string, now: Date) { return (await db.notification.updateMany({ where: { ownerId: owner, id, dismissedAt: null, expiresAt: { gt: now } }, data: { readAt: now } })).count > 0; },
        async dismiss(owner: OwnerId, id: string, now: Date) { return (await db.notification.updateMany({ where: { ownerId: owner, id, expiresAt: { gt: now } }, data: { dismissedAt: now } })).count > 0; },
    };
}
/** Worker batches all opted-in accounts. Fail explicitly above the bounded first-deployment capacity. */
export function createNotificationJob(db: PrismaClient, onError: (err: unknown) => void = () => { }) {
    return async (now: Date) => {
        await db.notification.deleteMany({ where: { expiresAt: { lte: now } } });
        const owners = await db.notificationPreference.findMany({ where: { enabled: true }, select: { ownerId: true }, take: 10001 });
        if (owners.length > 10000)
            throw new AppError('NOTIFICATION_CAPACITY_EXCEEDED', 503, 'Too many accounts');
        const service = createNotificationService(db);
        let processed = 0, failed = 0;
        for (const { ownerId } of owners) {
            try {
                await service.refresh(ownerId as OwnerId, now);
                processed++;
            }
            catch (err) {
                failed++;
                onError(err);
            }
        }
        return { processed, failed };
    };
}
