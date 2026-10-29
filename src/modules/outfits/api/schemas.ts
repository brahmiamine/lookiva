import { z } from 'zod';
import { OUTFIT_STATUSES, WEAR_STATUSES, isTimezone } from '../domain/outfit';
import { ROLES } from '../domain/roles';

const text = (max: number) => z.string().trim().min(1).max(max);
const instant = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const zone = z.string().max(64).refine(isTimezone, 'must be an IANA timezone such as Europe/Paris');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'must be a real YYYY-MM-DD date');

export const MAX_ITEMS = 12;
export const itemInput = z.strictObject({ garmentId: z.uuid(), role: z.enum(ROLES) });
const items = z.array(itemInput).max(MAX_ITEMS).refine((a) => new Set(a.map((i) => i.garmentId)).size === a.length, 'a garment can appear only once');

const schedule = {
  title: text(120).nullable(),
  occasion: text(80).nullable(),
  startsAt: instant.nullable(),
  endsAt: instant.nullable(),
  timezone: zone.nullable(),
};
export const outfitCreateBody = z.strictObject({
  title: schedule.title.optional(),
  occasion: schedule.occasion.optional(),
  startsAt: schedule.startsAt.optional(),
  endsAt: schedule.endsAt.optional(),
  timezone: schedule.timezone.optional(),
  status: z.enum(['DRAFT', 'PLANNED']).default('DRAFT'),
  items: items.default([]),
});
export const outfitPatchBody = z.strictObject({
  title: schedule.title.optional(),
  occasion: schedule.occasion.optional(),
  startsAt: schedule.startsAt.optional(),
  endsAt: schedule.endsAt.optional(),
  timezone: schedule.timezone.optional(),
  status: z.enum(['DRAFT', 'PLANNED']).optional(),
  items: items.optional(),
});
export const outfitListQuery = z.object({ status: z.enum(OUTFIT_STATUSES).optional(), from: date.optional(), to: date.optional() }).refine((q) => (q.from === undefined) === (q.to === undefined), 'from and to go together');
export const itemReplaceBody = z.strictObject({ garmentId: z.uuid(), role: z.enum(ROLES).optional() });

export const confirmBody = z.strictObject({ expectedVersion: z.number().int().min(1), timezone: zone.optional() });
export const washBody = z.strictObject({
  garmentIds: z.array(z.uuid()).max(MAX_ITEMS).refine((a) => new Set(a).size === a.length, 'ids must be unique'),
  expectedVersions: z.record(z.uuid(), z.number().int().min(1)).default({}),
}).refine((b) => Object.keys(b.expectedVersions).every((k) => b.garmentIds.includes(k)), { message: 'expectedVersions may only name garmentIds of the request', path: ['expectedVersions'] });
export const invalidateBody = z.strictObject({ reason: text(500) });
export const limitQuery = z.object({ limit: z.coerce.number().int().min(1).max(10).default(3) });

export const templateCreateBody = z.strictObject({ name: text(80), occasion: text(80).nullish().transform((v) => v ?? null), items: items.default([]) });
export const templatePatchBody = z.strictObject({ name: text(80).optional(), occasion: text(80).nullable().optional(), items: items.optional() });
export const instantiateBody = z.strictObject({
  startsAt: instant.nullable().optional(),
  endsAt: instant.nullable().optional(),
  timezone: zone.nullable().optional(),
  title: text(120).nullable().optional(),
  occasion: text(80).nullable().optional(),
  status: z.enum(['DRAFT', 'PLANNED']).optional(),
});
export const saveAsTemplateBody = z.strictObject({ name: text(80) });

// ---- responses (OpenAPI only)
const iso = z.string();
const itemView = z.object({ garmentId: z.uuid(), role: z.enum(ROLES), position: z.number().int() });
export const warning = z.object({ code: z.enum(['MISSING_ROLE', 'GARMENT_UNAVAILABLE', 'GARMENT_TRASHED']), role: z.string().optional(), garmentId: z.uuid().optional(), status: z.string().optional() });
export const outfitView = z.object({
  id: z.uuid(), title: z.string().nullable(), status: z.enum(OUTFIT_STATUSES), occasion: z.string().nullable(),
  startsAt: iso.nullable(), endsAt: iso.nullable(), localDate: z.string().nullable(), localTime: z.string().nullable(), timezone: z.string().nullable(),
  items: z.array(itemView), activeWearRecordId: z.uuid().nullable(), version: z.number().int(), createdAt: iso, updatedAt: iso,
  warnings: z.array(warning).optional(),
});
export const outfitsPage = z.object({ items: z.array(outfitView), nextCursor: z.string().optional() });
export const outfitsRange = z.object({ items: z.array(outfitView) });
const snapshot = z.object({
  nickname: z.string().nullable(), categoryCode: z.string(), subtypeCode: z.string().nullable(), customSubtypeLabel: z.string().nullable(),
  primaryColorCode: z.string(), extraColorCodes: z.array(z.string()),
});
export const wearRecordView = z.object({
  id: z.uuid(), outfitId: z.uuid(), title: z.string().nullable(), occasion: z.string().nullable(), status: z.enum(WEAR_STATUSES),
  confirmedAt: iso, localDate: z.string(), localTime: z.string(), timezone: z.string(),
  items: z.array(z.object({ garmentId: z.uuid().nullable(), role: z.enum(ROLES), position: z.number().int(), snapshot })),
  version: z.number().int(), invalidatedAt: iso.nullable(), invalidationReason: z.string().nullable(),
});
export const confirmResponse = z.object({ outfit: outfitView, wearRecord: wearRecordView });
export const lastWornResponse = z.object({ items: z.array(wearRecordView) });
export const garmentHistoryResponse = z.object({
  items: z.array(z.object({
    wearRecordId: z.uuid(), outfitId: z.uuid(), localDate: z.string(), localTime: z.string(), timezone: z.string(), confirmedAt: iso,
    role: z.enum(ROLES), title: z.string().nullable(), occasion: z.string().nullable(), snapshot,
  })),
});
export const washResponse = z.object({
  wearRecordId: z.uuid(),
  marked: z.array(z.uuid()),
  skipped: z.array(z.object({ garmentId: z.uuid(), status: z.string(), reason: z.literal('NOT_AVAILABLE') })),
  failed: z.array(z.object({ garmentId: z.uuid(), code: z.enum(['NOT_IN_RECORD', 'NOT_FOUND', 'VERSION_CONFLICT', 'STATUS_UPDATE_FAILED']), currentVersion: z.number().int().optional() })),
});
export const conflictsResponse = z.object({
  outfitId: z.uuid(),
  conflicts: z.array(z.object({
    kind: z.enum(['OVERLAP_CERTAIN', 'OVERLAP_POSSIBLE', 'GARMENT_UNAVAILABLE', 'GARMENT_TRASHED']), garmentId: z.uuid(),
    otherOutfitId: z.uuid().optional(), status: z.string().optional(), suggestions: z.array(z.uuid()),
  })),
});
export const templateView = z.object({
  id: z.uuid(), name: z.string(), occasion: z.string().nullable(), items: z.array(itemView), version: z.number().int(), createdAt: iso, updatedAt: iso,
  warnings: z.array(warning).optional(),
});
export const templatesPage = z.object({ items: z.array(templateView), nextCursor: z.string().optional() });
