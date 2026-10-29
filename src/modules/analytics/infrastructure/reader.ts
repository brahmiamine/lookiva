import type { PrismaClient } from '@/generated/prisma/client';
import type { OwnerId } from '@/platform/kernel';
import { AppError } from '@/platform/http/errors';
export async function readStats(db: PrismaClient, ownerId: OwnerId) {
    // One snapshot, so a simultaneous wear invalidation cannot produce mixed aggregates.
    return db.$transaction(async (tx) => {
        const garments = await tx.garment.findMany({ where: { ownerId, deletedAt: null }, select: { id: true, nickname: true, categoryCode: true, status: true, purchasePrice: true, purchaseCurrency: true, createdAt: true }, take: 5001 });
        const wears = await tx.wearRecordItem.findMany({ where: { garment: { ownerId, deletedAt: null }, wearRecord: { ownerId, status: 'ACTIVE' } }, select: { garmentId: true, wearRecord: { select: { confirmedAt: true } } }, take: 100001 });
        if (garments.length > 5000 || wears.length > 100000)
            throw new AppError('ANALYTICS_CAPACITY_EXCEEDED', 503, 'Statistics capacity exceeded');
        return { garments: garments.map(g => ({ id: g.id, name: g.nickname, price: g.purchasePrice?.toNumber() ?? null, currency: g.purchaseCurrency, createdAt: g.createdAt.toISOString(), category: g.categoryCode, status: g.status })), wears: wears.flatMap(w => w.garmentId ? [{ garmentId: w.garmentId, at: w.wearRecord.confirmedAt.toISOString() }] : []) };
    }, { isolationLevel: 'RepeatableRead' });
}
