import type { PrismaClient } from '@/generated/prisma/client';
import type { OwnerId } from '@/platform/kernel';
import { createPrismaOutfitStore } from './prisma-store';

export type OutfitSchedule = {
  id: string; status: string; localDate: string | null; localTime: string | null; timezone: string | null; startsAt: Date | null; endsAt: Date | null;
};

/** Read-only view of outfits and wear history for other modules (the recommendations module). Owner scoped. */
export function createPrismaOutfitReader(db: PrismaClient) {
  const outfits = createPrismaOutfitStore(db);
  return {
    async schedule(ownerId: OwnerId, id: string): Promise<OutfitSchedule | null> {
      const o = await outfits.findById(ownerId, id);
      return o && { id: o.id, status: o.status, localDate: o.localDate, localTime: o.localTime, timezone: o.timezone, startsAt: o.startsAt ? new Date(o.startsAt) : null, endsAt: o.endsAt ? new Date(o.endsAt) : null };
    },
    /** Latest ACTIVE wear date (YYYY-MM-DD) per garment id; garments never worn are absent. */
    async lastWornDates(ownerId: OwnerId, garmentIds: string[]): Promise<Map<string, string>> {
      const out = new Map<string, string>();
      if (!garmentIds.length) return out;
      const rows = await db.wearRecordItem.findMany({
        where: { garmentId: { in: garmentIds }, wearRecord: { ownerId, status: 'ACTIVE' } },
        select: { garmentId: true, wearRecord: { select: { localDate: true } } },
        orderBy: { wearRecord: { localDate: 'desc' } },
        take: 5000,
      });
      for (const r of rows) if (r.garmentId && !out.has(r.garmentId)) out.set(r.garmentId, r.wearRecord.localDate.toISOString().slice(0, 10));
      return out;
    },
  };
}
export type OutfitReader = ReturnType<typeof createPrismaOutfitReader>;
