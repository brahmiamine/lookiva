import { z } from 'zod';
import { CATEGORY_CODES, COLOR_CODES, SEASON_CODES, STYLE_CODES, SUBTYPE_CODES } from '../domain/catalog';
import { GARMENT_STATUSES } from '../domain/status';

export const searchQuery = z.strictObject({
  q: z.string().trim().max(200).default(''),
  category: z.enum(CATEGORY_CODES).optional(), subtype: z.enum(SUBTYPE_CODES).optional(), color: z.enum(COLOR_CODES).optional(),
  season: z.enum(SEASON_CODES).optional(), style: z.enum(STYLE_CODES).optional(), status: z.enum(GARMENT_STATUSES).optional(),
  tag: z.uuid().optional(), collection: z.uuid().optional(), set: z.uuid().optional(),
  sort: z.enum(['relevance', 'newest', 'availability']).default('relevance'),
  limit: z.coerce.number().int().min(1).max(100).default(20), cursor: z.string().min(1).max(2048).optional(),
});
export const suggestionsQuery = z.strictObject({ q: z.string().trim().min(1).max(200) });
export const draftBody = z.strictObject({ garmentIds: z.array(z.uuid()).min(1).max(30).refine((ids) => new Set(ids).size === ids.length, 'IDs must be unique') });
const expanded = z.object({ term: z.string(), field: z.enum(['category', 'subtype', 'color', 'season', 'style', 'status']), codes: z.array(z.string()), estimated: z.boolean() });
export const interpretation = z.object({ unsupported: z.boolean(), filters: z.record(z.string(), z.array(z.string())), terms: z.array(z.string()), expanded: z.array(expanded) });
export const searchResponse = z.object({
  mode: z.literal('text'), dictionaryVersion: z.string(), interpretation,
  items: z.array(z.object({ id: z.uuid(), nickname: z.string().nullable(), categoryCode: z.string(), subtypeCode: z.string().nullable(), customLabel: z.string().nullable(), primaryColorCode: z.string(), status: z.enum(GARMENT_STATUSES), score: z.number(), reasons: z.array(z.enum(['CATALOG', 'TEXT', 'FILTER'])) })),
  nextCursor: z.string().optional(),
});
export const draftResponse = z.object({ garmentIds: z.array(z.uuid()), unavailableIds: z.array(z.uuid()), saved: z.literal(false) });
