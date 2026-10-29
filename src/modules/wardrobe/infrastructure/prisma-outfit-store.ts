import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { OwnerId } from '@/platform/kernel';
import { snapshotName, type OutfitStatus } from '../domain/outfit';
import type { ConfirmResult, OutfitStore, OutfitView } from '../application/outfit-service';

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

const INCLUDE = {
  items: { orderBy: { garmentId: 'asc' }, include: { garment: { include: { customSubcategory: { select: { label: true } } } } } },
  wears: { select: { id: true }, take: 1 },
} as const;

type Row = Prisma.OutfitGetPayload<{ include: typeof INCLUDE }>;

const toView = (o: Row): OutfitView => ({
  id: o.id,
  name: o.name,
  status: o.status as OutfitStatus,
  version: o.version,
  wearRecordId: o.wears[0]?.id ?? null,
  items: o.items.map((i) => ({
    garmentId: i.garmentId,
    name: snapshotName({ nickname: i.garment.nickname, customLabel: i.garment.customSubcategory?.label ?? null, subtypeCode: i.garment.subtypeCode, categoryCode: i.garment.categoryCode }),
    categoryCode: i.garment.categoryCode,
    colorCode: i.garment.primaryColorCode,
  })),
  createdAt: o.createdAt.toISOString(),
  updatedAt: o.updatedAt.toISOString(),
});

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
            name: input.name,
            status: 'DRAFT',
            version: 1,
            createdAt: now,
            updatedAt: now,
            items: { create: input.garmentIds.map((garmentId) => ({ garmentId })) },
          },
        });
        return read(tx, owner, id);
      }, TX),

    get: (owner, id) => read(db, owner, id),

    /**
     * One transaction: the outfit moves to WORN with a version bump and one WearRecord snapshot is written. Garment rows are
     * read, never written: confirming a wear does not change any garment status.
     */
    confirmWorn: (owner, id, now, wearRecordId, nextId) =>
      db.$transaction(async (tx): Promise<ConfirmResult> => {
        const o = await tx.outfit.findFirst({
          where: { id, ownerId: owner },
          include: { items: { include: { garment: { include: { customSubcategory: { select: { label: true } } } } } } },
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
            wornAt: now,
            createdAt: now,
            items: {
              create: o.items.map((i) => ({
                id: nextId(),
                garmentId: i.garmentId,
                garmentName: snapshotName({ nickname: i.garment.nickname, customLabel: i.garment.customSubcategory?.label ?? null, subtypeCode: i.garment.subtypeCode, categoryCode: i.garment.categoryCode }).slice(0, 120),
                categoryCode: i.garment.categoryCode,
                colorCode: i.garment.primaryColorCode,
              })),
            },
          },
        });
        return { kind: 'OK', outfit: (await read(tx, owner, id)) as OutfitView };
      }, TX),
  };
}

