import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { MAX_PHOTOS_PER_GARMENT } from '../domain/photo';
import type { PhotoRow, PhotoStore } from '../application/photo-ports';

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

type Db = PrismaClient | Prisma.TransactionClient;
type Dbo = NonNullable<Awaited<ReturnType<PrismaClient['garmentPhoto']['findFirst']>>>;
const toRow = (r: Dbo): PhotoRow => ({ ...r, isPrimary: r.primarySlot === 1, cutoutStatus: r.cutoutStatus as PhotoRow['cutoutStatus'] });

/** Serialises photo writes of one garment (limit, positions, primary switch). Returns false when the garment is gone. */
async function lockGarment(tx: Prisma.TransactionClient, ownerId: string, garmentId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM garments WHERE id = ${garmentId} AND ownerId = ${ownerId} AND deletedAt IS NULL FOR UPDATE`;
  return rows.length === 1;
}

export function createPrismaPhotoStore(db: PrismaClient): PhotoStore {
  const find = async (c: Db, ownerId: string, garmentId: string, id: string) => {
    const r = await c.garmentPhoto.findFirst({ where: { id, garmentId, ownerId } });
    return r ? toRow(r) : null;
  };
  return {
    async list(ownerId, garmentId) {
      return (await db.garmentPhoto.findMany({ where: { garmentId, ownerId }, orderBy: { position: 'asc' } })).map(toRow);
    },

    find: (ownerId, garmentId, photoId) => find(db, ownerId, garmentId, photoId),

    async add(ownerId, p) {
      return db.$transaction(async (tx) => {
        if (!(await lockGarment(tx, ownerId, p.garmentId))) return 'gone';
        const existing = await tx.garmentPhoto.findMany({ where: { garmentId: p.garmentId }, select: { position: true } });
        if (existing.length >= MAX_PHOTOS_PER_GARMENT) return 'full';
        const position = existing.reduce((m, e) => Math.max(m, e.position), 0) + 1;
        const r = await tx.garmentPhoto.create({ data: { ...p, position, primarySlot: existing.length === 0 ? 1 : null } });
        return toRow(r);
      }, TX);
    },

    async setPrimary(ownerId, garmentId, photoId) {
      return db.$transaction(async (tx) => {
        if (!(await lockGarment(tx, ownerId, garmentId)) || !(await find(tx, ownerId, garmentId, photoId))) return false;
        await tx.garmentPhoto.updateMany({ where: { garmentId, primarySlot: 1 }, data: { primarySlot: null } });
        await tx.garmentPhoto.update({ where: { id: photoId }, data: { primarySlot: 1 } });
        return true;
      }, TX);
    },

    async remove(ownerId, garmentId, photoId) {
      return db.$transaction(async (tx) => {
        if (!(await lockGarment(tx, ownerId, garmentId))) return null;
        const row = await find(tx, ownerId, garmentId, photoId);
        if (!row) return null;
        await tx.garmentPhoto.delete({ where: { id: photoId } });
        if (row.isPrimary) {
          const next = await tx.garmentPhoto.findFirst({ where: { garmentId }, orderBy: { position: 'asc' }, select: { id: true } });
          if (next) await tx.garmentPhoto.update({ where: { id: next.id }, data: { primarySlot: 1 } });
        }
        return row;
      }, TX);
    },

    async setCutout(ownerId, garmentId, photoId, c) {
      const { count } = await db.garmentPhoto.updateMany({
        where: { id: photoId, garmentId, ownerId },
        data: { cutoutStatus: c.status, ...(c.key === undefined ? {} : { cutoutKey: c.key }) },
      });
      return count === 1 ? find(db, ownerId, garmentId, photoId) : null;
    },

    async copyAll(ownerId, sourceGarmentId, targetGarmentId, newId, now) {
      return db.$transaction(async (tx) => {
        if (!(await lockGarment(tx, ownerId, targetGarmentId))) return 'gone';
        if ((await tx.garmentPhoto.count({ where: { garmentId: targetGarmentId } })) > 0) return 'not_empty';
        const src = await tx.garmentPhoto.findMany({ where: { garmentId: sourceGarmentId, ownerId }, orderBy: { position: 'asc' } });
        if (src.length) await tx.garmentPhoto.createMany({ data: src.map((r) => ({ ...r, id: newId(), garmentId: targetGarmentId, createdAt: now })) });
        return src.length;
      }, TX);
    },

    async unreferenced(keys) {
      const out: string[] = [];
      for (const key of new Set(keys)) {
        const n = await db.garmentPhoto.count({ where: { OR: [{ originalKey: key }, { optimizedKey: key }, { thumbKey: key }, { cutoutKey: key }] } });
        if (n === 0) out.push(key);
      }
      return out;
    },
  };
}
