import { z } from 'zod';
import { AppError } from '@/platform/http/errors';
import { CATEGORY_CODES, COLOR_CODES, SEASON_CODES, SHADE_CODES, STYLE_CODES, SUBTYPE_CODES } from '../domain/catalog';
import { WEATHER_FIELDS } from '../domain/garment';
import { GARMENT_STATUSES } from '../domain/status';

const colorRef = z.strictObject({ code: z.enum(COLOR_CODES), shade: z.enum(SHADE_CODES).nullish().transform((v) => v ?? null) });
const unique = <T extends z.ZodType>(item: T, max: number) =>
  z.array(item).max(max).refine((a) => new Set(a).size === a.length, 'values must be unique');
const text = (max: number) => z.string().trim().min(1).max(max);
const cents = z.number().min(0).max(99_999_999.99).refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'at most 2 decimals');

const weather = {
  warmth: z.enum(WEATHER_FIELDS.warmth),
  rain: z.enum(WEATHER_FIELDS.rain),
  windproof: z.enum(WEATHER_FIELDS.windproof),
  breathability: z.enum(WEATHER_FIELDS.breathability),
  layering: z.enum(WEATHER_FIELDS.layering),
};

const fields = {
  nickname: text(80).nullable(),
  categoryCode: z.enum(CATEGORY_CODES),
  subtypeCode: z.enum(SUBTYPE_CODES).nullable(),
  customSubcategoryId: z.uuid().nullable(),
  primaryColor: colorRef,
  extraColors: z.array(colorRef).max(4),
  seasons: unique(z.enum(SEASON_CODES), 4),
  styles: unique(z.enum(STYLE_CODES), 9),
  purchasePrice: cents.nullable(),
  purchaseCurrency: z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code').nullable(),
  purchasedOn: z.iso.date().nullable(),
  purchaseStore: text(120).nullable(),
  notes: text(2000).nullable(),
  ...weather,
};

/** Optional keys default to "empty / UNKNOWN"; category, primary color and (subtype xor custom) are checked by the service. */
export const garmentCreateBody = z.strictObject({
  categoryCode: fields.categoryCode,
  primaryColor: fields.primaryColor,
  subtypeCode: fields.subtypeCode.nullish().transform((v) => v ?? null),
  customSubcategoryId: fields.customSubcategoryId.nullish().transform((v) => v ?? null),
  nickname: fields.nickname.nullish().transform((v) => v ?? null),
  extraColors: fields.extraColors.default([]),
  seasons: fields.seasons.default([]),
  styles: fields.styles.default([]),
  purchasePrice: fields.purchasePrice.nullish().transform((v) => v ?? null),
  purchaseCurrency: fields.purchaseCurrency.nullish().transform((v) => v ?? null),
  purchasedOn: fields.purchasedOn.nullish().transform((v) => v ?? null),
  purchaseStore: fields.purchaseStore.nullish().transform((v) => v ?? null),
  notes: fields.notes.nullish().transform((v) => v ?? null),
  warmth: weather.warmth.default('UNKNOWN'),
  rain: weather.rain.default('UNKNOWN'),
  windproof: weather.windproof.default('UNKNOWN'),
  breathability: weather.breathability.default('UNKNOWN'),
  layering: weather.layering.default('UNKNOWN'),
});

const optionalFields = {
  ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])),
} as { [K in keyof typeof fields]: z.ZodOptional<(typeof fields)[K]> };

/** Status is deliberately absent (strict): it only changes through POST /garments/{id}/status. */
export const garmentPatchBody = z.strictObject(optionalFields).refine((b) => Object.keys(b).length > 0, 'at least one field is required');

/** Duplication: every field optional (an override of the source's value), plus the photo switch. */
export const garmentDuplicateBody = z.strictObject({ ...optionalFields, copyPhotos: z.boolean().default(false) });

// ---- bulk actions
const bulkCommon = {
  ids: z.array(z.uuid()).min(1).max(100).refine((a) => new Set(a).size === a.length, 'ids must be unique'),
  expectedVersions: z.record(z.uuid(), z.number().int().min(1)).default({}),
};
export const bulkBody = z.discriminatedUnion('action', [
  z.strictObject({ ...bulkCommon, action: z.literal('SET_STATUS'), params: z.strictObject({ status: z.enum(GARMENT_STATUSES), note: text(500).nullish().transform((v) => v ?? null) }) }),
  z.strictObject({
    ...bulkCommon,
    action: z.literal('SET_CATEGORY'),
    params: z.strictObject({
      categoryCode: fields.categoryCode,
      subtypeCode: fields.subtypeCode.nullish().transform((v) => v ?? null),
      customSubcategoryId: fields.customSubcategoryId.nullish().transform((v) => v ?? null),
    }),
  }),
  z.strictObject({ ...bulkCommon, action: z.literal('DELETE') }),
]);

// ---- tags, collections, garment sets
export const organizerCreateBody = (max: number) => z.strictObject({ name: text(max) });
export const organizerAttachBody = z.strictObject({ garmentIds: z.array(z.uuid()).min(1).max(100) });

export const statusBody = z.strictObject({ status: z.enum(GARMENT_STATUSES), note: text(500).nullish().transform((v) => v ?? null) });

const filterQuery = z.object({
  category: z.enum(CATEGORY_CODES).optional(),
  subtype: z.enum(SUBTYPE_CODES).optional(),
  color: z.enum(COLOR_CODES).optional(),
  season: z.enum(SEASON_CODES).optional(),
  style: z.enum(STYLE_CODES).optional(),
  status: z.enum(GARMENT_STATUSES).optional(),
  q: z.string().trim().min(1).max(100).optional(),
});
export const garmentListQuery = filterQuery;

export const customCreateBody = z.strictObject({ label: text(60), parentSubtypeCode: z.enum(SUBTYPE_CODES) });
export const customPatchBody = z.strictObject({ label: text(60) });
export const customDeleteQuery = z.object({ reassignTo: z.string().min(1).max(64).optional() });

// ---- responses (OpenAPI only)
const labels = z.object({ fr: z.string(), en: z.string(), ar: z.string() });
const iso = z.string();
export const garmentView = z.object({
  id: z.uuid(),
  nickname: z.string().nullable(),
  categoryCode: z.string(),
  subtypeCode: z.string().nullable(),
  customSubcategory: z.object({ id: z.uuid(), label: z.string(), parentSubtypeCode: z.string() }).nullable(),
  primaryColor: z.object({ code: z.string(), shade: z.string().nullable() }),
  extraColors: z.array(z.object({ code: z.string(), shade: z.string().nullable() })),
  seasons: z.array(z.string()),
  styles: z.array(z.string()),
  purchasePrice: z.number().nullable(),
  purchaseCurrency: z.string().nullable(),
  purchasedOn: z.string().nullable(),
  purchaseStore: z.string().nullable(),
  notes: z.string().nullable(),
  warmth: z.string(), rain: z.string(), windproof: z.string(), breathability: z.string(), layering: z.string(),
  status: z.enum(GARMENT_STATUSES),
  recommendable: z.boolean(),
  version: z.number().int(),
  createdAt: iso,
  updatedAt: iso,
});
export const garmentsPage = z.object({ items: z.array(garmentView), nextCursor: z.string().optional() });
export const statusEventView = z.object({ id: z.uuid(), fromStatus: z.enum(GARMENT_STATUSES).nullable(), toStatus: z.enum(GARMENT_STATUSES), source: z.string(), note: z.string().nullable(), at: iso });
export const statusHistoryPage = z.object({ items: z.array(statusEventView), nextCursor: z.string().optional() });
export const customView = z.object({
  id: z.uuid(), label: z.string(), parentSubtypeCode: z.string(), categoryCode: z.string(),
  garmentCount: z.number().int(), version: z.number().int(), createdAt: iso, updatedAt: iso,
});
export const customPage = z.object({ items: z.array(customView), nextCursor: z.string().optional() });
export const categoriesResponse = z.object({
  items: z.array(z.object({ code: z.string(), labels, subtypes: z.array(z.object({ code: z.string(), labels })) })),
});
export const colorsResponse = z.object({
  items: z.array(z.object({ code: z.string(), hex: z.string(), labels })),
  shades: z.array(z.object({ code: z.string(), labels })),
});
export const optionsResponse = z.object({
  statuses: z.array(z.object({ code: z.enum(GARMENT_STATUSES), recommendable: z.boolean(), labels })),
  seasons: z.array(z.object({ code: z.string(), labels })),
  styles: z.array(z.object({ code: z.string(), labels })),
  weather: z.record(z.string(), z.array(z.string())),
});

export const invalidVariant = () => new AppError('VALIDATION_ERROR', 400, 'Validation failed', [{ path: 'variant', message: 'variant must be thumb, optimized, original or cutout' }]);

export const photoView = z.object({
  id: z.uuid(), garmentId: z.uuid(), position: z.number().int(), isPrimary: z.boolean(),
  cutoutStatus: z.enum(['READY', 'FAILED']).nullable(), mime: z.string(), bytes: z.number().int(),
  width: z.number().int(), height: z.number().int(), sha256: z.string(), createdAt: z.iso.datetime(),
});
export const photosResponse = z.object({ items: z.array(photoView) });
export const photoUploadBody = z.object({
  file: z.string().describe('binary: JPEG, PNG or WebP, at most 10 MiB, at most 50 megapixels (HEIC is refused)'),
  rotate: z.enum(['0', '90', '180', '270']).optional().describe('extra clockwise rotation, applied after the EXIF orientation'),
  crop: z.string().optional().describe('JSON {"left","top","width","height"} in pixels of the oriented + rotated image'),
});
export const photoFileQuery = z.object({ variant: z.enum(['thumb', 'optimized', 'original', 'cutout']).optional() });

export const usageWarning = z.object({ garmentId: z.uuid(), kind: z.string(), count: z.number().int() });
export const warningsResponse = z.object({ warnings: z.array(usageWarning) });
export const trashedView = garmentView.extend({ deletedAt: iso, purgeAfter: iso });
export const trashPage = z.object({ items: z.array(trashedView), nextCursor: z.string().optional() });
export const bulkResponse = z.object({
  action: z.enum(['SET_STATUS', 'SET_CATEGORY', 'DELETE']),
  affected: z.number().int(),
  changedIds: z.array(z.uuid()),
  unchangedIds: z.array(z.uuid()),
  warnings: z.array(usageWarning),
});
export const organizerView = z.object({
  id: z.uuid(), name: z.string(), garments: z.array(z.object({ id: z.uuid(), trashed: z.boolean() })),
  version: z.number().int(), createdAt: iso, updatedAt: iso,
});
export const organizerPage = z.object({ items: z.array(organizerView), nextCursor: z.string().optional() });
