import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { AppError } from '@/platform/http/errors';
import { MAX_GARMENTS_PER_USER } from '../domain/garment';
import type { SearchReader } from '../application/search-service';

export function createPrismaSearchReader(db: PrismaClient): SearchReader {
  return {
    async list(ownerId, input) {
      const f = input.filters ?? {};
      const and: Prisma.GarmentWhereInput[] = [];
      if (f.subtype) and.push({ OR: [{ subtypeCode: f.subtype }, { customSubcategory: { ownerId, parentSubtypeCode: f.subtype } }] });
      if (f.color) and.push({ OR: [{ primaryColorCode: f.color }, { colors: { some: { colorCode: f.color } } }] });
      const rows = await db.garment.findMany({
        where: {
          ownerId, deletedAt: null,
          ...(f.category ? { categoryCode: f.category } : {}), ...(f.status ? { status: f.status } : {}),
          ...(f.season ? { seasons: { some: { code: f.season } } } : {}), ...(f.style ? { styles: { some: { code: f.style } } } : {}),
          ...(input.tag ? { tagLinks: { some: { tag: { id: input.tag, ownerId } } } } : {}),
          ...(input.collection ? { collectionLinks: { some: { collection: { id: input.collection, ownerId } } } } : {}),
          ...(input.set ? { setItems: { some: { set: { id: input.set, ownerId } } } } : {}),
          AND: and,
        },
        select: {
          id: true, nickname: true, categoryCode: true, subtypeCode: true, primaryColorCode: true, status: true, notes: true, purchaseStore: true, createdAt: true,
          customSubcategory: { select: { ownerId: true, label: true, parentSubtypeCode: true } },
          colors: { select: { colorCode: true } }, seasons: { select: { code: true } }, styles: { select: { code: true } },
          tagLinks: { where: { tag: { ownerId } }, select: { tag: { select: { label: true } } } },
          collectionLinks: { where: { collection: { ownerId } }, select: { collection: { select: { name: true } } } },
          setItems: { where: { set: { ownerId } }, select: { set: { select: { name: true } } } },
        },
        orderBy: { id: 'desc' }, take: MAX_GARMENTS_PER_USER + 1,
      });
      // Fail explicitly instead of returning plausible but incomplete results for an oversized legacy wardrobe.
      if (rows.length > MAX_GARMENTS_PER_USER) throw new AppError('SEARCH_CAPACITY_EXCEEDED', 503, 'Search capacity exceeded');
      return rows.map((r) => ({
        id: r.id, nickname: r.nickname, categoryCode: r.categoryCode,
        subtypeCode: r.subtypeCode ?? (r.customSubcategory?.ownerId === ownerId ? r.customSubcategory.parentSubtypeCode : null),
        customLabel: r.customSubcategory?.ownerId === ownerId ? r.customSubcategory.label : null,
        primaryColorCode: r.primaryColorCode, extraColorCodes: r.colors.map((c) => c.colorCode), status: r.status,
        seasons: r.seasons.map((s) => s.code), styles: r.styles.map((s) => s.code), notes: r.notes, purchaseStore: r.purchaseStore,
        tags: r.tagLinks.map((t) => t.tag.label), collections: r.collectionLinks.map((c) => c.collection.name), sets: r.setItems.map((s) => s.set.name),
        createdAt: r.createdAt.toISOString(),
      }));
    },
  };
}
