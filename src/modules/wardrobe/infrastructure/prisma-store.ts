import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { newId } from '@/platform/http/ids';
import { encodeCursor } from '@/platform/http/pagination';
import type { OwnerId, Page } from '@/platform/kernel';
import { categoryOfSubtype } from '../domain/catalog';
import { normalizeLabel, purgeAfter } from '../domain/garment';
import { DEFAULT_STATUS, isRecommendable, type GarmentStatus } from '../domain/status';
import type { CustomSubcategoryStore, CustomSubcategoryView, GarmentData, GarmentFilter, GarmentStore, GarmentView, StatusEventView } from '../application/ports';

// READ COMMITTED like identity: every guard is an UPDATE ... WHERE version = n, which re-reads the latest committed row after a lock wait.
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };
const code = (e: unknown): string | undefined => (e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined);

const INCLUDE = {
  customSubcategory: { select: { id: true, label: true, parentSubtypeCode: true } },
  colors: { orderBy: { position: 'asc' } },
  seasons: { orderBy: { code: 'asc' } },
  styles: { orderBy: { code: 'asc' } },
} satisfies Prisma.GarmentInclude;
type Row = Prisma.GarmentGetPayload<{ include: typeof INCLUDE }>;

const toView = (r: Row): GarmentView => ({
  id: r.id,
  nickname: r.nickname,
  categoryCode: r.categoryCode,
  subtypeCode: r.subtypeCode,
  customSubcategory: r.customSubcategory,
  primaryColor: { code: r.primaryColorCode, shade: r.primaryShade },
  extraColors: r.colors.map((c) => ({ code: c.colorCode, shade: c.shade })),
  seasons: r.seasons.map((s) => s.code),
  styles: r.styles.map((s) => s.code),
  purchasePrice: r.purchasePrice === null ? null : r.purchasePrice.toNumber(),
  purchaseCurrency: r.purchaseCurrency,
  purchasedOn: r.purchasedOn === null ? null : r.purchasedOn.toISOString().slice(0, 10),
  purchaseStore: r.purchaseStore,
  notes: r.notes,
  warmth: r.warmth,
  rain: r.rain,
  windproof: r.windproof,
  breathability: r.breathability,
  layering: r.layering,
  status: r.status as GarmentStatus,
  recommendable: isRecommendable(r.status as GarmentStatus),
  version: r.version,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

const scalars = (d: GarmentData) => ({
  nickname: d.nickname,
  categoryCode: d.categoryCode,
  subtypeCode: d.subtypeCode,
  customSubcategoryId: d.customSubcategoryId,
  primaryColorCode: d.primaryColor.code,
  primaryShade: d.primaryColor.shade,
  purchasePrice: d.purchasePrice,
  purchaseCurrency: d.purchaseCurrency,
  purchasedOn: d.purchasedOn === null ? null : new Date(`${d.purchasedOn}T00:00:00.000Z`),
  purchaseStore: d.purchaseStore,
  notes: d.notes,
  warmth: d.warmth,
  rain: d.rain,
  windproof: d.windproof,
  breathability: d.breathability,
  layering: d.layering,
});

const children = (garmentId: string, d: GarmentData) => ({
  colors: d.extraColors.map((c, position) => ({ garmentId, position, colorCode: c.code, shade: c.shade })),
  seasons: d.seasons.map((c) => ({ garmentId, code: c })),
  styles: d.styles.map((c) => ({ garmentId, code: c })),
});

const page = <T extends { id: string }>(rows: T[], limit: number): Page<T> => {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return rows.length > limit && last ? { items, nextCursor: encodeCursor({ id: last.id }) } : { items };
};

// Prisma `contains` does not escape LIKE wildcards; MariaDB's default escape character is the backslash.
const likeEscape = (v: string): string => v.replace(/[\\%_]/g, "\\$&");

function where(ownerId: OwnerId, f: GarmentFilter = {}): Prisma.GarmentWhereInput {
  return {
    ownerId,
    deletedAt: null,
    ...(f.category ? { categoryCode: f.category } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.subtype ? { OR: [{ subtypeCode: f.subtype }, { customSubcategory: { parentSubtypeCode: f.subtype } }] } : {}),
    ...(f.season ? { seasons: { some: { code: f.season } } } : {}),
    ...(f.style ? { styles: { some: { code: f.style } } } : {}),
    ...(f.color ? { AND: [{ OR: [{ primaryColorCode: f.color }, { colors: { some: { colorCode: f.color } } }] }] } : {}),
    ...(f.q ? { AND: [{ OR: [{ nickname: { contains: likeEscape(f.q) } }, { notes: { contains: likeEscape(f.q) } }] }] } : {}),
  };
}

export function createPrismaGarmentStore(db: PrismaClient): GarmentStore {
  const read = async (ownerId: OwnerId, id: string): Promise<GarmentView | null> => {
    const r = await db.garment.findFirst({ where: { id, ownerId, deletedAt: null }, include: INCLUDE });
    return r ? toView(r) : null;
  };
  return {
    findById: read,

    async list(ownerId, p) {
      const rows = await db.garment.findMany({
        where: { ...where(ownerId, p.filter), ...(p.cursor ? { id: { lt: p.cursor.id } } : {}) },
        include: INCLUDE,
        orderBy: { id: 'desc' },
        take: p.limit + 1,
      });
      return page(rows.map(toView), p.limit);
    },

    async create(ownerId, d, now) {
      const id = newId();
      await db.$transaction(async (tx) => {
        await tx.garment.create({ data: { id, ownerId, ...scalars(d), status: DEFAULT_STATUS, createdAt: now, updatedAt: now } });
        const c = children(id, d);
        await tx.garmentColor.createMany({ data: c.colors });
        await tx.garmentSeason.createMany({ data: c.seasons });
        await tx.garmentStyle.createMany({ data: c.styles });
        await tx.garmentStatusEvent.create({ data: { id: newId(), garmentId: id, ownerId, fromStatus: null, toStatus: DEFAULT_STATUS, at: now } });
      }, TX);
      return (await read(ownerId, id)) as GarmentView;
    },

    async update(ownerId, id, expectedVersion, d, now) {
      const ok = await db.$transaction(async (tx) => {
        const { count } = await tx.garment.updateMany({
          where: { id, ownerId, version: expectedVersion, deletedAt: null },
          data: { ...scalars(d), version: { increment: 1 }, updatedAt: now },
        });
        if (count !== 1) return false;
        const c = children(id, d);
        await tx.garmentColor.deleteMany({ where: { garmentId: id } });
        await tx.garmentSeason.deleteMany({ where: { garmentId: id } });
        await tx.garmentStyle.deleteMany({ where: { garmentId: id } });
        await tx.garmentColor.createMany({ data: c.colors });
        await tx.garmentSeason.createMany({ data: c.seasons });
        await tx.garmentStyle.createMany({ data: c.styles });
        return true;
      }, TX);
      return ok ? read(ownerId, id) : null;
    },

    async changeStatus(ownerId, id, expectedVersion, to, note, now) {
      const ok = await db.$transaction(async (tx) => {
        const cur = await tx.garment.findFirst({ where: { id, ownerId, version: expectedVersion, deletedAt: null }, select: { status: true } });
        if (!cur) return false;
        const { count } = await tx.garment.updateMany({
          where: { id, ownerId, version: expectedVersion, deletedAt: null },
          data: { status: to, version: { increment: 1 }, updatedAt: now },
        });
        if (count !== 1) return false;
        await tx.garmentStatusEvent.create({ data: { id: newId(), garmentId: id, ownerId, fromStatus: cur.status, toStatus: to, note, at: now } });
        return true;
      }, TX);
      return ok ? read(ownerId, id) : null;
    },

    async softDelete(ownerId, id, now) {
      const { count } = await db.garment.updateMany({
        where: { id, ownerId, deletedAt: null },
        data: { deletedAt: now, purgeAfter: purgeAfter(now), version: { increment: 1 }, updatedAt: now },
      });
      return count === 1;
    },

    async listStatusEvents(ownerId, garmentId, p) {
      const rows = await db.garmentStatusEvent.findMany({
        where: { garmentId, ownerId, ...(p.cursor ? { id: { lt: p.cursor.id } } : {}) },
        orderBy: { id: 'desc' },
        take: p.limit + 1,
      });
      const views: StatusEventView[] = rows.map((e) => ({
        id: e.id,
        fromStatus: e.fromStatus as GarmentStatus | null,
        toStatus: e.toStatus as GarmentStatus,
        source: e.source,
        note: e.note,
        at: e.at.toISOString(),
      }));
      return page(views, p.limit);
    },
  };
}

type CRow = Prisma.CustomSubcategoryGetPayload<{ include: { _count: { select: { garments: true } } } }>;
const CINCLUDE = { _count: { select: { garments: true } } } as const;
const toCustom = (r: CRow): CustomSubcategoryView => ({
  id: r.id,
  label: r.label,
  parentSubtypeCode: r.parentSubtypeCode,
  categoryCode: categoryOfSubtype(r.parentSubtypeCode) as string,
  garmentCount: r._count.garments, // trashed garments count too: they come back on restore
  version: r.version,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export function createPrismaCustomSubcategoryStore(db: PrismaClient): CustomSubcategoryStore {
  const read = async (ownerId: OwnerId, id: string) => {
    const r = await db.customSubcategory.findFirst({ where: { id, ownerId }, include: CINCLUDE });
    return r ? toCustom(r) : null;
  };
  return {
    findById: read,

    async list(ownerId, p) {
      const rows = await db.customSubcategory.findMany({
        where: { ownerId, ...(p.cursor ? { id: { lt: p.cursor.id } } : {}) },
        include: CINCLUDE,
        orderBy: { id: 'desc' },
        take: p.limit + 1,
      });
      return page(rows.map(toCustom), p.limit);
    },

    async create(ownerId, c, now) {
      const id = newId();
      try {
        await db.customSubcategory.create({
          data: { id, ownerId, label: c.label, labelNormalized: normalizeLabel(c.label), parentSubtypeCode: c.parentSubtypeCode, createdAt: now, updatedAt: now },
        });
      } catch (e) {
        if (code(e) === 'P2002') return null;
        throw e;
      }
      return (await read(ownerId, id)) as CustomSubcategoryView;
    },

    async rename(ownerId, id, expectedVersion, label, now) {
      try {
        const { count } = await db.customSubcategory.updateMany({
          where: { id, ownerId, version: expectedVersion },
          data: { label, labelNormalized: normalizeLabel(label), version: { increment: 1 }, updatedAt: now },
        });
        if (count !== 1) return 'conflict';
      } catch (e) {
        if (code(e) === 'P2002') return 'exists';
        throw e;
      }
      return (await read(ownerId, id)) ?? 'conflict';
    },

    async remove(ownerId, id, target, now) {
      try {
        return await db.$transaction(async (tx) => {
          if (target) {
            await tx.garment.updateMany({
              where: { ownerId, customSubcategoryId: id },
              data: {
                subtypeCode: 'subtypeCode' in target ? target.subtypeCode : null,
                customSubcategoryId: 'customSubcategoryId' in target ? target.customSubcategoryId : null,
                version: { increment: 1 },
                updatedAt: now,
              },
            });
          }
          // The RESTRICT foreign key makes this fail (and roll back the move) if a garment still points here.
          const { count } = await tx.customSubcategory.deleteMany({ where: { id, ownerId } });
          return count === 1 ? 'ok' : 'missing';
        }, TX);
      } catch (e) {
        if (code(e) === 'P2003' || code(e) === 'P2034') return 'in_use';
        throw e;
      }
    },
  };
}
