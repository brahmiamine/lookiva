import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { newId } from '@/platform/http/ids';
import { encodeCursor } from '@/platform/http/pagination';
import type { OwnerId, Page } from '@/platform/kernel';
import type { OutfitStatus, WearStatus } from '../domain/outfit';
import type { Role } from '../domain/roles';
import type { ConfirmResult, GarmentWearEntry, ItemInput, Neighbor, OutfitData, OutfitStore, OutfitView, Snapshot, TemplateStore, TemplateView, WearItemView, WearRecordView, WearStore } from '../application/ports';

// READ COMMITTED like wardrobe: every guard is an UPDATE ... WHERE version = n.
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };
const code = (e: unknown): string | undefined => (e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined);

const day = (d: Date | null): string | null => (d === null ? null : d.toISOString().slice(0, 10));
const asDate = (v: string | null): Date | null => (v === null ? null : new Date(`${v}T00:00:00.000Z`));
const page = <T extends { id: string }>(rows: T[], limit: number): Page<T> => {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return rows.length > limit && last ? { items, nextCursor: encodeCursor({ id: last.id }) } : { items };
};
const itemRows = (items: ItemInput[]) => items.map((it, position) => ({ garmentId: it.garmentId, role: it.role, position }));

const OUTFIT_INCLUDE = {
  items: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
  wearRecords: { where: { status: 'ACTIVE' }, select: { id: true } },
} satisfies Prisma.OutfitInclude;
type OutfitRow = Prisma.OutfitGetPayload<{ include: typeof OUTFIT_INCLUDE }>;

const toOutfit = (r: OutfitRow): OutfitView => ({
  id: r.id,
  title: r.title,
  status: r.status as OutfitStatus,
  occasion: r.occasion,
  startsAt: r.startsAt?.toISOString() ?? null,
  endsAt: r.endsAt?.toISOString() ?? null,
  localDate: day(r.localDate),
  localTime: r.localTime,
  timezone: r.timezone,
  items: r.items.map((i) => ({ garmentId: i.garmentId, role: i.role as Role, position: i.position })),
  activeWearRecordId: r.wearRecords[0]?.id ?? null,
  version: r.version,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

const WEAR_INCLUDE = { items: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } } satisfies Prisma.WearRecordInclude;
type WearRow = Prisma.WearRecordGetPayload<{ include: typeof WEAR_INCLUDE }>;
type WearItemRow = WearRow['items'][number];
const toSnapshot = (i: WearItemRow): Snapshot => ({
  nickname: i.nickname,
  categoryCode: i.categoryCode,
  subtypeCode: i.subtypeCode,
  customSubtypeLabel: i.customSubtypeLabel,
  primaryColorCode: i.primaryColorCode,
  extraColorCodes: i.extraColorCodes as string[],
});
const toWear = (r: WearRow): WearRecordView => ({
  id: r.id,
  outfitId: r.outfitId,
  title: r.title,
  occasion: r.occasion,
  status: r.status as WearStatus,
  confirmedAt: r.confirmedAt.toISOString(),
  localDate: day(r.localDate) as string,
  localTime: r.localTime,
  timezone: r.timezone,
  items: r.items.map((i): WearItemView => ({ garmentId: i.garmentId, role: i.role as Role, position: i.position, snapshot: toSnapshot(i) })),
  version: r.version,
  invalidatedAt: r.invalidatedAt?.toISOString() ?? null,
  invalidationReason: r.invalidationReason,
});

const scalars = (d: Partial<OutfitData>) => ({
  ...(d.title !== undefined ? { title: d.title } : {}),
  ...(d.occasion !== undefined ? { occasion: d.occasion } : {}),
  ...(d.status !== undefined ? { status: d.status } : {}),
  ...(d.startsAt !== undefined ? { startsAt: d.startsAt } : {}),
  ...(d.endsAt !== undefined ? { endsAt: d.endsAt } : {}),
  ...(d.localDate !== undefined ? { localDate: asDate(d.localDate) } : {}),
  ...(d.localTime !== undefined ? { localTime: d.localTime } : {}),
  ...(d.timezone !== undefined ? { timezone: d.timezone } : {}),
});

export function createPrismaOutfitStore(db: PrismaClient): OutfitStore {
  const read = async (ownerId: OwnerId, id: string): Promise<OutfitView | null> => {
    const r = await db.outfit.findFirst({ where: { id, ownerId }, include: OUTFIT_INCLUDE });
    return r ? toOutfit(r) : null;
  };
  return {
    findById: read,

    async create(ownerId, d, items, now) {
      const id = newId();
      await db.$transaction(async (tx) => {
        await tx.outfit.create({ data: { id, ownerId, ...scalars(d), status: d.status, createdAt: now, updatedAt: now } });
        await tx.outfitItem.createMany({ data: itemRows(items).map((r) => ({ id: newId(), outfitId: id, ...r })) });
      }, TX);
      return (await read(ownerId, id)) as OutfitView;
    },

    async update(ownerId, id, expectedVersion, d, items, now) {
      const ok = await db.$transaction(async (tx) => {
        const { count } = await tx.outfit.updateMany({
          where: { id, ownerId, version: expectedVersion, status: { in: ['DRAFT', 'PLANNED'] } },
          data: { ...scalars(d), version: { increment: 1 }, updatedAt: now },
        });
        if (count !== 1) return false;
        if (items) {
          await tx.outfitItem.deleteMany({ where: { outfitId: id } });
          await tx.outfitItem.createMany({ data: itemRows(items).map((r) => ({ id: newId(), outfitId: id, ...r })) });
        }
        return true;
      }, TX);
      return ok ? read(ownerId, id) : null;
    },

    async list(ownerId, p) {
      const rows = await db.outfit.findMany({
        where: { ownerId, ...(p.status ? { status: p.status } : {}), ...(p.cursor ? { id: { lt: p.cursor.id } } : {}) },
        include: OUTFIT_INCLUDE,
        orderBy: { id: 'desc' },
        take: p.limit + 1,
      });
      return page(rows.map(toOutfit), p.limit);
    },

    async range(ownerId, from, to, status) {
      const rows = await db.outfit.findMany({
        where: { ownerId, localDate: { gte: asDate(from) as Date, lte: asDate(to) as Date }, ...(status ? { status } : {}) },
        include: OUTFIT_INCLUDE,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 201,
      });
      return rows.map(toOutfit);
    },

    async neighbors(ownerId, outfitId, garmentIds, from, to) {
      if (!garmentIds.length) return [];
      const rows = await db.outfit.findMany({
        where: { ownerId, id: { not: outfitId }, status: { in: ['DRAFT', 'PLANNED'] }, startsAt: { gte: from, lte: to }, items: { some: { garmentId: { in: garmentIds } } } },
        include: { items: { where: { garmentId: { in: garmentIds } }, select: { garmentId: true } } },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 200,
      });
      return rows.map((r): Neighbor => ({
        outfitId: r.id, title: r.title, status: r.status as OutfitStatus, startsAt: r.startsAt as Date, endsAt: r.endsAt,
        localDate: day(r.localDate) as string, garmentIds: r.items.map((i) => i.garmentId),
      }));
    },

    async confirm(ownerId, id, expectedVersion, rec, now): Promise<ConfirmResult> {
      const fail = async (): Promise<ConfirmResult> => {
        const cur = await db.outfit.findFirst({ where: { id, ownerId }, select: { status: true } });
        if (cur?.status === 'WORN') return { ok: false, code: 'ALREADY_WORN' };
        return { ok: false, code: cur && (cur.status === 'DRAFT' || cur.status === 'PLANNED') ? 'VERSION_CONFLICT' : 'NOT_CONFIRMABLE' };
      };
      try {
        const done = await db.$transaction(async (tx) => {
          const { count } = await tx.outfit.updateMany({
            where: { id, ownerId, version: expectedVersion, status: { in: ['DRAFT', 'PLANNED'] } },
            data: { status: 'WORN', version: { increment: 1 }, updatedAt: now },
          });
          if (count !== 1) return false;
          const o = await tx.outfit.findFirst({ where: { id, ownerId }, select: { title: true, occasion: true } });
          await tx.wearRecord.create({
            data: {
              id: rec.id, ownerId, outfitId: id, title: o?.title ?? null, occasion: o?.occasion ?? null, status: 'ACTIVE', activeSlot: 1,
              confirmedAt: rec.confirmedAt, localDate: asDate(rec.localDate) as Date, localTime: rec.localTime, timezone: rec.timezone, createdAt: now,
            },
          });
          await tx.wearRecordItem.createMany({
            data: rec.items.map((i) => ({ id: newId(), wearRecordId: rec.id, garmentId: i.garmentId, role: i.role, position: i.position, ...i.snapshot })),
          });
          return true;
        }, TX);
        if (!done) return fail();
      } catch (e) {
        // Backstop: UNIQUE(outfitId, activeSlot) caught a second ACTIVE record (the transaction rolled back).
        if (code(e) === 'P2002') return { ok: false, code: 'ALREADY_WORN' };
        throw e;
      }
      const [outfit, record] = await Promise.all([read(ownerId, id), db.wearRecord.findFirst({ where: { id: rec.id, ownerId }, include: WEAR_INCLUDE })]);
      return { ok: true, outfit: outfit as OutfitView, record: toWear(record as WearRow) };
    },
  };
}

export function createPrismaWearStore(db: PrismaClient): WearStore {
  const read = async (ownerId: OwnerId, id: string): Promise<WearRecordView | null> => {
    const r = await db.wearRecord.findFirst({ where: { id, ownerId }, include: WEAR_INCLUDE });
    return r ? toWear(r) : null;
  };
  return {
    findById: read,

    async invalidate(ownerId, id, expectedVersion, reason, now) {
      const ok = await db.$transaction(async (tx) => {
        const { count } = await tx.wearRecord.updateMany({
          where: { id, ownerId, version: expectedVersion, status: 'ACTIVE' },
          data: { status: 'INVALIDATED', activeSlot: null, invalidatedAt: now, invalidationReason: reason, version: { increment: 1 } },
        });
        if (count !== 1) return false;
        const rec = await tx.wearRecord.findFirstOrThrow({ where: { id, ownerId }, select: { outfitId: true } });
        const o = await tx.outfit.findFirstOrThrow({ where: { id: rec.outfitId, ownerId }, select: { startsAt: true, timezone: true, occasion: true } });
        // Back to the plan it came from: PLANNED when the plan is complete, else DRAFT. Re-confirmation is then possible.
        await tx.outfit.updateMany({
          where: { id: rec.outfitId, ownerId, status: 'WORN' },
          data: { status: o.startsAt && o.timezone && o.occasion ? 'PLANNED' : 'DRAFT', version: { increment: 1 }, updatedAt: now },
        });
        return true;
      }, TX);
      return ok ? read(ownerId, id) : null;
    },

    async lastWorn(ownerId, limit) {
      const rows = await db.wearRecord.findMany({ where: { ownerId, status: 'ACTIVE' }, include: WEAR_INCLUDE, orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }], take: limit });
      return rows.map(toWear);
    },

    async garmentHistory(ownerId, garmentId, limit) {
      const rows = await db.wearRecordItem.findMany({
        where: { garmentId, wearRecord: { ownerId, status: 'ACTIVE' } },
        include: { wearRecord: true },
        orderBy: [{ wearRecord: { confirmedAt: 'desc' } }, { id: 'desc' }],
        take: 100,
      });
      const seen = new Set<string>();
      const out: GarmentWearEntry[] = [];
      for (const i of rows) {
        const d = day(i.wearRecord.localDate) as string;
        if (seen.has(d)) continue;
        seen.add(d);
        out.push({
          wearRecordId: i.wearRecordId, outfitId: i.wearRecord.outfitId, localDate: d, localTime: i.wearRecord.localTime, timezone: i.wearRecord.timezone,
          confirmedAt: i.wearRecord.confirmedAt.toISOString(), role: i.role as Role, title: i.wearRecord.title, occasion: i.wearRecord.occasion, snapshot: toSnapshot(i),
        });
        if (out.length === limit) break;
      }
      return out;
    },
  };
}

const TEMPLATE_INCLUDE = { items: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } } satisfies Prisma.OutfitTemplateInclude;
const toTemplate = (r: Prisma.OutfitTemplateGetPayload<{ include: typeof TEMPLATE_INCLUDE }>): TemplateView => ({
  id: r.id,
  name: r.name,
  occasion: r.occasion,
  items: r.items.map((i) => ({ garmentId: i.garmentId, role: i.role as Role, position: i.position })),
  version: r.version,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export function createPrismaTemplateStore(db: PrismaClient): TemplateStore {
  const read = async (ownerId: OwnerId, id: string) => {
    const r = await db.outfitTemplate.findFirst({ where: { id, ownerId }, include: TEMPLATE_INCLUDE });
    return r ? toTemplate(r) : null;
  };
  return {
    findById: read,

    async create(ownerId, d, items, now) {
      const id = newId();
      await db.$transaction(async (tx) => {
        await tx.outfitTemplate.create({ data: { id, ownerId, name: d.name, occasion: d.occasion, createdAt: now, updatedAt: now } });
        await tx.outfitTemplateItem.createMany({ data: itemRows(items).map((r) => ({ id: newId(), templateId: id, ...r })) });
      }, TX);
      return (await read(ownerId, id)) as TemplateView;
    },

    async update(ownerId, id, expectedVersion, d, items, now) {
      const ok = await db.$transaction(async (tx) => {
        const { count } = await tx.outfitTemplate.updateMany({
          where: { id, ownerId, version: expectedVersion },
          data: { ...(d.name !== undefined ? { name: d.name } : {}), ...(d.occasion !== undefined ? { occasion: d.occasion } : {}), version: { increment: 1 }, updatedAt: now },
        });
        if (count !== 1) return false;
        if (items) {
          await tx.outfitTemplateItem.deleteMany({ where: { templateId: id } });
          await tx.outfitTemplateItem.createMany({ data: itemRows(items).map((r) => ({ id: newId(), templateId: id, ...r })) });
        }
        return true;
      }, TX);
      return ok ? read(ownerId, id) : null;
    },

    async list(ownerId, p) {
      const rows = await db.outfitTemplate.findMany({ where: { ownerId, ...(p.cursor ? { id: { lt: p.cursor.id } } : {}) }, include: TEMPLATE_INCLUDE, orderBy: { id: 'desc' }, take: p.limit + 1 });
      return page(rows.map(toTemplate), p.limit);
    },

    async remove(ownerId, id) {
      const { count } = await db.outfitTemplate.deleteMany({ where: { id, ownerId } });
      return count === 1;
    },
  };
}

/** Wardrobe's GarmentUsageChecker: garments sitting in DRAFT/PLANNED outfits (advisory warnings on trash / delete). */
export function createPrismaUsageChecker(db: PrismaClient) {
  return {
    async check(ownerId: OwnerId, garmentIds: string[]): Promise<{ garmentId: string; kind: string; count: number }[]> {
      if (!garmentIds.length) return [];
      const rows = await db.outfitItem.groupBy({
        by: ['garmentId'],
        where: { garmentId: { in: garmentIds }, outfit: { ownerId, status: { in: ['DRAFT', 'PLANNED'] } } },
        _count: { _all: true },
      });
      return rows.map((r) => ({ garmentId: r.garmentId, kind: 'IN_ACTIVE_OUTFITS', count: r._count._all }));
    },
  };
}
