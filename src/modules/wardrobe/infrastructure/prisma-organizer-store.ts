import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { newId } from '@/platform/http/ids';
import { encodeCursor } from '@/platform/http/pagination';
import type { Page } from '@/platform/kernel';
import { normalizeLabel } from '../domain/garment';
import { MAX_MEMBERS, type OrganizerKind, type OrganizerStore, type OrganizerView } from '../application/organizer';

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

/** The three kinds differ only by names: one table for the group, one link table with (parentKey, garmentId, position). */
const CONFIG = {
  tags: { model: 'tag', field: 'label', table: 'tags', parent: 'tagId' },
  collections: { model: 'collection', field: 'name', table: 'collections', parent: 'collectionId' },
  sets: { model: 'garmentSet', field: 'name', table: 'garment_sets', parent: 'setId' },
} as const;

type Row = { id: string; version: number; createdAt: Date; updatedAt: Date; items: { garmentId: string; garment: { deletedAt: Date | null } }[] } & Record<string, unknown>;
/* eslint-disable @typescript-eslint/no-explicit-any -- the three Prisma delegates are structurally identical; typing them per kind would triple this file */
type Delegate = { findFirst(a: any): Promise<Row | null>; findMany(a: any): Promise<Row[]>; create(a: any): Promise<unknown>; updateMany(a: any): Promise<{ count: number }>; count(a: any): Promise<number>; deleteMany(a: any): Promise<{ count: number }> };
type Link = { findMany(a: any): Promise<{ garmentId: string; position: number }[]>; createMany(a: any): Promise<unknown>; deleteMany(a: any): Promise<{ count: number }> };
/* eslint-enable @typescript-eslint/no-explicit-any */
const LINK_MODEL = { tags: 'garmentTag', collections: 'collectionGarment', sets: 'garmentSetItem' } as const;

const INCLUDE = { items: { orderBy: { position: 'asc' }, select: { garmentId: true, garment: { select: { deletedAt: true } } } } } as const;
const isDup = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

export function createPrismaOrganizerStore(db: PrismaClient, kind: OrganizerKind): OrganizerStore {
  const c = CONFIG[kind];
  const model = (client: PrismaClient | Prisma.TransactionClient = db) => (client as unknown as Record<string, Delegate>)[c.model] as Delegate;
  const links = (client: PrismaClient | Prisma.TransactionClient) => (client as unknown as Record<string, Link>)[LINK_MODEL[kind]] as Link;
  const toView = (r: Row): OrganizerView => ({
    id: r.id,
    name: r[c.field] as string,
    garments: r.items.map((i) => ({ id: i.garmentId, trashed: i.garment.deletedAt !== null })),
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  });
  const read = async (ownerId: string, id: string, client: PrismaClient | Prisma.TransactionClient = db) => {
    const r = await model(client).findFirst({ where: { id, ownerId }, include: INCLUDE });
    return r ? toView(r) : null;
  };
  const nameData = (name: string) => ({ [c.field]: name, [`${c.field}Normalized`]: normalizeLabel(name) });
  /** Serialises attach / detach on one group; false = unknown group. */
  const lock = async (tx: Prisma.TransactionClient, ownerId: string, id: string) =>
    (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ${Prisma.raw(c.table)} WHERE id = ${id} AND ownerId = ${ownerId} FOR UPDATE`).length === 1;
  const bump = (tx: Prisma.TransactionClient, id: string, now: Date) =>
    model(tx).updateMany({ where: { id }, data: { version: { increment: 1 }, updatedAt: now } });

  return {
    findById: (ownerId, id) => read(ownerId, id),

    count: (ownerId) => model().count({ where: { ownerId } }),

    async list(ownerId, p): Promise<Page<OrganizerView>> {
      const rows = await model().findMany({ where: { ownerId, ...(p.cursor ? { id: { lt: p.cursor.id } } : {}) }, include: INCLUDE, orderBy: { id: 'desc' }, take: p.limit + 1 });
      const items = rows.slice(0, p.limit).map(toView);
      const last = items.at(-1);
      return rows.length > p.limit && last ? { items, nextCursor: encodeCursor({ id: last.id }) } : { items };
    },

    async create(ownerId, name, now) {
      const id = newId();
      try {
        await model().create({ data: { id, ownerId, ...nameData(name), createdAt: now, updatedAt: now } });
      } catch (e) {
        if (isDup(e)) return null;
        throw e;
      }
      return read(ownerId, id);
    },

    async rename(ownerId, id, expectedVersion, name, now) {
      try {
        const { count } = await model().updateMany({ where: { id, ownerId, version: expectedVersion }, data: { ...nameData(name), version: { increment: 1 }, updatedAt: now } });
        if (count !== 1) return 'conflict';
      } catch (e) {
        if (isDup(e)) return 'exists';
        throw e;
      }
      return (await read(ownerId, id)) ?? 'conflict';
    },

    async remove(ownerId, id) {
      return (await model().deleteMany({ where: { id, ownerId } })).count === 1;
    },

    async attach(ownerId, id, garmentIds, now) {
      return db.$transaction(async (tx) => {
        if (!(await lock(tx, ownerId, id))) return 'missing' as const;
        const found = await tx.garment.findMany({ where: { id: { in: garmentIds }, ownerId, deletedAt: null }, select: { id: true } });
        const ok = new Set(found.map((g) => g.id));
        const missingGarmentIds = garmentIds.filter((g) => !ok.has(g));
        if (missingGarmentIds.length) return { missingGarmentIds };
        const existing = await links(tx).findMany({ where: { [c.parent]: id }, select: { garmentId: true, position: true } });
        const have = new Set(existing.map((e) => e.garmentId));
        const fresh = garmentIds.filter((g) => !have.has(g));
        if (existing.length + fresh.length > MAX_MEMBERS) return 'full' as const;
        if (fresh.length) {
          const start = existing.reduce((m, e) => Math.max(m, e.position), 0) + 1;
          await links(tx).createMany({ data: fresh.map((garmentId, i) => ({ [c.parent]: id, garmentId, position: start + i })) });
          await bump(tx, id, now);
        }
        return (await read(ownerId, id, tx)) as OrganizerView;
      }, TX);
    },

    async detach(ownerId, id, garmentId, now) {
      return db.$transaction(async (tx) => {
        if (!(await lock(tx, ownerId, id))) return null;
        if ((await links(tx).deleteMany({ where: { [c.parent]: id, garmentId } })).count) await bump(tx, id, now);
        return read(ownerId, id, tx);
      }, TX);
    },
  };
}
