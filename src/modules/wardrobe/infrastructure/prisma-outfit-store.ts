import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { newId } from '@/platform/http/ids';
import type { OwnerId } from '@/platform/kernel';
import { snapshotName, type OutfitStatus } from '../domain/outfit';
import type { ConfirmResult, MarkResult, OutfitStore, OutfitView, WearView } from '../application/outfit-service';

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

const INCLUDE = {
  items: { orderBy: { garmentId: 'asc' }, include: { garment: { include: { customSubcategory: { select: { label: true } } } } } },
  wearRecords: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 },
} as const;

type Row = Prisma.OutfitGetPayload<{ include: typeof INCLUDE }>;

const toView = (o: Row): OutfitView => ({
  id: o.id,
  name: o.title,
  status: o.status as OutfitStatus,
  plannedFor: o.startsAt?.toISOString() ?? null,
  occasion: o.occasion,
  version: o.version,
  wearRecordId: o.wearRecords[0]?.id ?? null,
  items: o.items.map((i) => ({
    garmentId: i.garmentId,
    name: snapshotName({ nickname: i.garment.nickname, customLabel: i.garment.customSubcategory?.label ?? null, subtypeCode: i.garment.subtypeCode, categoryCode: i.garment.categoryCode }),
    categoryCode: i.garment.categoryCode,
    colorCode: i.garment.primaryColorCode,
  })),
  createdAt: o.createdAt.toISOString(),
  updatedAt: o.updatedAt.toISOString(),
});

/** Compatibility adapter for the original wardrobe screens. Maps their name/plannedFor/wornAt DTOs
 * to the current outfits schema; the legacy API's timezone-less instants are represented in UTC.
 * Existing history is never rewritten. New clients use the outfits module directly. */
export function createPrismaOutfitStore(db: PrismaClient): OutfitStore {
  const read = (client: PrismaClient | Prisma.TransactionClient, owner: OwnerId, id: string) =>
    client.outfit.findFirst({ where: { id, ownerId: owner }, include: INCLUDE }).then((o) => (o ? toView(o) : null));

  return {
    /** Every garment must be the owner's and live; otherwise nothing is created and null is returned. */
    create: (owner, input, now, id) =>
      db.$transaction(async (tx) => {
        if (input.garmentIds.length > 0) {
          const live = await tx.garment.count({ where: { id: { in: input.garmentIds }, ownerId: owner, deletedAt: null } });
          if (live !== input.garmentIds.length) return null;
        }
        await tx.outfit.create({
          data: {
            id,
            ownerId: owner,
            title: input.name,
            status: 'DRAFT',
            version: 1,
            createdAt: now,
            updatedAt: now,
            items: { create: input.garmentIds.map((garmentId, position) => ({ id: newId(), garmentId, role: 'OTHER', position })) },
          },
        });
        return read(tx, owner, id);
      }, TX),

    get: (owner, id) => read(db, owner, id),

    /**
     * One transaction for the laundry step only: each ticked garment must belong to this wear and be live. Changed rows get a
     * status event. The wear record and its snapshot are not written.
     */
    markToWash: (owner, wearRecordId, garmentIds, now, newId) =>
      db.$transaction(async (tx): Promise<MarkResult> => {
        const wear = await tx.wearRecord.findFirst({ where: { id: wearRecordId, ownerId: owner }, select: { items: { select: { garmentId: true } } } });
        if (!wear) return { kind: 'NOT_FOUND' };
        const inWear = new Set(wear.items.map((i) => i.garmentId));
        const outside = garmentIds.filter((g) => !inWear.has(g));
        if (outside.length > 0) return { kind: 'NOT_IN_WEAR', garmentIds: outside };

        const live = await tx.garment.findMany({ where: { id: { in: garmentIds }, ownerId: owner, deletedAt: null }, select: { id: true, status: true } });
        const missing = garmentIds.filter((g) => !live.some((l) => l.id === g));
        if (missing.length > 0) return { kind: 'GARMENT_UNAVAILABLE', garmentIds: missing };

        const changing = live.filter((g) => g.status !== 'TO_WASH');
        for (const g of changing) {
          // The status guard turns a concurrent change into a no-op for this row, never a silent overwrite.
          const moved = await tx.garment.updateMany({ where: { id: g.id, ownerId: owner, status: g.status }, data: { status: 'TO_WASH', version: { increment: 1 }, updatedAt: now } });
          if (moved.count === 1) await tx.garmentStatusEvent.create({ data: { id: newId(), garmentId: g.id, ownerId: owner, fromStatus: g.status, toStatus: 'TO_WASH', source: 'WEAR_WASH', at: now } });
        }
        return { kind: 'OK', changedIds: changing.map((g) => g.id), unchangedIds: live.filter((g) => g.status === 'TO_WASH').map((g) => g.id) };
      }, TX),

    wearsOf: (owner, garmentId) =>
      db.wearRecordItem
        .findMany({
          where: { garmentId, wearRecord: { ownerId: owner, status: 'ACTIVE' } },
          orderBy: { wearRecord: { confirmedAt: 'desc' } },
          take: 20,
          select: { wearRecord: { select: { id: true, confirmedAt: true, outfitId: true } } },
        })
        .then((rows): WearView[] => rows.map((r) => ({ wearRecordId: r.wearRecord.id, wornAt: r.wearRecord.confirmedAt.toISOString(), outfitId: r.wearRecord.outfitId }))),

    list: (owner, f) =>
      db.outfit
        .findMany({ where: { ownerId: owner, status: f.status, ...(f.from || f.to ? { startsAt: { gte: f.from, lt: f.to } } : {}) }, orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }], include: INCLUDE, take: 100 })
        .then((rows) => rows.map(toView)),

    /** One guarded UPDATE: the version in the WHERE clause makes a lost race a null, never a silent overwrite. */
    update: (owner, id, expectedVersion, patch, now) =>
      db.$transaction(async (tx) => {
        const moved = await tx.outfit.updateMany({
          where: { id, ownerId: owner, version: expectedVersion },
          data: {
            ...(patch.name !== undefined && { title: patch.name }),
            ...(patch.occasion !== undefined && { occasion: patch.occasion }),
            ...(patch.plannedFor !== undefined && { startsAt: patch.plannedFor, localDate: patch.plannedFor ? new Date(patch.plannedFor.toISOString().slice(0, 10)) : null, localTime: patch.plannedFor?.toISOString().slice(11, 16) ?? null, timezone: patch.plannedFor ? 'UTC' : null }),
            ...(patch.status !== undefined && { status: patch.status }),
            version: { increment: 1 },
            updatedAt: now,
          },
        });
        return moved.count === 1 ? read(tx, owner, id) : null;
      }, TX),

    /**
     * One transaction: the outfit moves to WORN with a version bump and one WearRecord snapshot is written. Garment rows are
     * read, never written: confirming a wear does not change any garment status.
     */
    confirmWorn: (owner, id, now, wearRecordId, nextId) =>
      db.$transaction(async (tx): Promise<ConfirmResult> => {
        const o = await tx.outfit.findFirst({
          where: { id, ownerId: owner },
          include: { items: { include: { garment: { include: { customSubcategory: { select: { label: true } }, colors: true } } } } },
        });
        if (!o) return { kind: 'NOT_FOUND' };
        const alreadyWorn = async () => ({ kind: 'ALREADY_WORN' as const, wearRecordId: (await tx.wearRecord.findFirst({ where: { outfitId: id }, select: { id: true } }))?.id ?? '' });
        if (o.status === 'WORN') return alreadyWorn();
        if (o.status === 'CANCELLED') return { kind: 'CANCELLED' };

        const trashed = o.items.filter((i) => i.garment.deletedAt !== null).map((i) => i.garmentId);
        if (trashed.length > 0) return { kind: 'GARMENT_UNAVAILABLE', garmentIds: trashed };

        // The status guard makes a concurrent second confirmation lose here instead of writing a second snapshot.
        const moved = await tx.outfit.updateMany({ where: { id, ownerId: owner, status: { in: ['DRAFT', 'PLANNED'] } }, data: { status: 'WORN', version: { increment: 1 }, updatedAt: now } });
        if (moved.count !== 1) return alreadyWorn();

        await tx.wearRecord.create({
          data: {
            id: wearRecordId,
            ownerId: owner,
            outfitId: id,
            title: o.title, occasion: o.occasion, status: 'ACTIVE', activeSlot: 1,
            confirmedAt: now, localDate: o.localDate ?? new Date(now.toISOString().slice(0, 10)),
            localTime: o.localTime ?? now.toISOString().slice(11, 16), timezone: o.timezone ?? 'UTC',
            createdAt: now,
            items: {
              create: o.items.map((i) => ({
                id: nextId(),
                garmentId: i.garmentId,
                role: i.role, position: i.position, nickname: i.garment.nickname,
                subtypeCode: i.garment.subtypeCode, customSubtypeLabel: i.garment.customSubcategory?.label ?? null,
                categoryCode: i.garment.categoryCode,
                primaryColorCode: i.garment.primaryColorCode, extraColorCodes: i.garment.colors.map((c) => c.colorCode),
              })),
            },
          },
        });
        return { kind: 'OK', outfit: (await read(tx, owner, id)) as OutfitView };
      }, TX),
  };
}

