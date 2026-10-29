import type { PrismaClient } from '@/generated/prisma/client';
import type { Clock } from '@/platform/clock/port';
import type { GarmentGateway, GarmentRef } from '../application/ports';
import type { GarmentStatus } from '../domain/status';
import { createPrismaGarmentStore } from './prisma-store';

const INCLUDE = { customSubcategory: { select: { label: true } }, colors: { orderBy: { position: 'asc' } } } as const;
type Row = Awaited<ReturnType<PrismaClient['garment']['findFirst']>> & { customSubcategory: { label: string } | null; colors: { colorCode: string }[] };

const toRef = (r: NonNullable<Row>): GarmentRef => ({
  id: r.id,
  nickname: r.nickname,
  categoryCode: r.categoryCode,
  subtypeCode: r.subtypeCode,
  customSubtypeLabel: r.customSubcategory?.label ?? null,
  primaryColorCode: r.primaryColorCode,
  extraColorCodes: r.colors.map((c) => c.colorCode),
  status: r.status as GarmentStatus,
  version: r.version,
  trashed: r.deletedAt !== null,
});

export function createPrismaGarmentGateway(db: PrismaClient, clock: Clock): GarmentGateway {
  const store = createPrismaGarmentStore(db);
  const one = async (ownerId: string, id: string) => {
    const r = await db.garment.findFirst({ where: { id, ownerId, deletedAt: null }, include: INCLUDE });
    return r ? toRef(r as NonNullable<Row>) : null;
  };
  return {
    async find(ownerId, ids) {
      if (!ids.length) return [];
      const rows = await db.garment.findMany({ where: { ownerId, id: { in: ids } }, include: INCLUDE });
      return rows.map((r) => toRef(r as NonNullable<Row>));
    },

    async setStatus(ownerId, id, to, o) {
      const cur = await one(ownerId, id);
      if (!cur) return { ok: false, code: 'NOT_FOUND' };
      if (o.expectedVersion !== undefined && o.expectedVersion !== cur.version) return { ok: false, code: 'VERSION_CONFLICT', currentVersion: cur.version };
      if (o.onlyFrom && !o.onlyFrom.includes(cur.status)) return { ok: false, code: 'NOT_ELIGIBLE', status: cur.status };
      if (cur.status === to) return { ok: false, code: 'NOT_ELIGIBLE', status: cur.status };
      // Compare-and-set on the version just read: a racing change makes this a VERSION_CONFLICT, never a lost update.
      const next = await store.changeStatus(ownerId, id, cur.version, to, o.note, clock.now(), o.source);
      if (!next) return { ok: false, code: 'VERSION_CONFLICT', currentVersion: (await one(ownerId, id))?.version };
      return { ok: true, ref: { ...cur, status: next.status, version: next.version } };
    },

    async availableInCategory(ownerId, categoryCode, excludeIds, limit) {
      const rows = await db.garment.findMany({
        where: { ownerId, deletedAt: null, status: 'AVAILABLE', categoryCode, ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}) },
        select: { id: true },
        orderBy: { id: 'desc' },
        take: limit,
      });
      return rows.map((r) => r.id);
    },

    async listRecommendable(ownerId, limit) {
      const rows = await db.garment.findMany({
        where: { ownerId, deletedAt: null, status: 'AVAILABLE' },
        include: { colors: { orderBy: { position: 'asc' } }, seasons: true, styles: true },
        orderBy: { id: 'desc' },
        take: limit,
      });
      return rows.map((r) => ({
        id: r.id, categoryCode: r.categoryCode, subtypeCode: r.subtypeCode, primaryColorCode: r.primaryColorCode,
        extraColorCodes: r.colors.map((c) => c.colorCode), warmth: r.warmth, rain: r.rain, windproof: r.windproof,
        breathability: r.breathability, layering: r.layering, seasons: r.seasons.map((s) => s.code), styles: r.styles.map((s) => s.code),
      }));
    },
  };
}
