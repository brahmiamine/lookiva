import type { PrismaClient, Prisma, PlannerEntry } from '@/generated/prisma/client';
import { newId } from '@/platform/http/ids';
import type { PlanningStore } from '../application/ports';
const view = (r: PlannerEntry) => ({ id: r.id, payload: r.payload, version: r.version, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() });
export function createPlanningStore(db: PrismaClient): PlanningStore {
    return {
        async list(ownerId, kind, limit, before) { return (await db.plannerEntry.findMany({ where: { ownerId, kind, ...(before ? { id: { lt: before } } : {}) }, orderBy: { id: 'desc' }, take: limit })).map(view); },
        async get(ownerId, kind, id) { const r = await db.plannerEntry.findFirst({ where: { ownerId, kind, id } }); return r ? view(r) : null; },
        async create(ownerId, kind, payload, now) { return view(await db.plannerEntry.create({ data: { id: newId(), ownerId, kind, payload: payload as Prisma.InputJsonValue, createdAt: now, updatedAt: now } })); },
        async update(ownerId, kind, id, version, payload, now) {
            return db.$transaction(async (tx) => {
                const r = await tx.plannerEntry.updateMany({ where: { ownerId, kind, id, version }, data: { payload: payload as Prisma.InputJsonValue, version: { increment: 1 }, updatedAt: now } });
                if (!r.count)
                    return null;
                const next = await tx.plannerEntry.findFirst({ where: { ownerId, kind, id } });
                return next ? view(next) : null;
            });
        },
        async remove(ownerId, kind, id, version) { return (await db.plannerEntry.deleteMany({ where: { ownerId, kind, id, version } })).count === 1; },
    };
}
