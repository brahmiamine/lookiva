import { categoryOfSubtype } from './catalog';

/** Weather-relevant attributes; UNKNOWN is the default and is never guessed. */
export const WEATHER_FIELDS = {
  warmth: ['UNKNOWN', 'LIGHT', 'MEDIUM', 'WARM', 'VERY_WARM'],
  rain: ['UNKNOWN', 'NONE', 'RESISTANT', 'WATERPROOF'],
  windproof: ['UNKNOWN', 'YES', 'NO'],
  breathability: ['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH'],
  layering: ['UNKNOWN', 'BASE', 'MID', 'OUTER'],
} as const;
export type WeatherField = keyof typeof WEATHER_FIELDS;

export const TRASH_RETENTION_DAYS = 30;
export const purgeAfter = (deletedAt: Date): Date => new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * 86_400_000);

export type ClassificationError = 'SUBTYPE_REQUIRED' | 'SUBTYPE_AND_CUSTOM' | 'SUBTYPE_NOT_IN_CATEGORY' | 'CUSTOM_PARENT_NOT_IN_CATEGORY';

/**
 * A garment carries a standard subtype of its category, or a custom subcategory whose standard parent belongs to that category.
 * `customParent` is the parent subtype code of the chosen custom subcategory.
 */
export function classificationError(c: { categoryCode: string; subtypeCode: string | null; customParent: string | null }): ClassificationError | null {
  if (c.subtypeCode !== null && c.customParent !== null) return 'SUBTYPE_AND_CUSTOM';
  if (c.subtypeCode === null && c.customParent === null) return 'SUBTYPE_REQUIRED';
  if (c.subtypeCode !== null) return categoryOfSubtype(c.subtypeCode) === c.categoryCode ? null : 'SUBTYPE_NOT_IN_CATEGORY';
  return categoryOfSubtype(c.customParent as string) === c.categoryCode ? null : 'CUSTOM_PARENT_NOT_IN_CATEGORY';
}

export const normalizeLabel = (s: string): string => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

export const purchaseError = (price: number | null, currency: string | null): boolean => price !== null && currency === null;
