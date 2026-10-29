// Pure helpers of the wardrobe screens (unit tested in tests/ui/wardrobe-logic.test.ts).
import type { FieldError } from '@/ui/api-client';
import { WEATHER, type Garment, type WeatherField } from './types';

// ---------------------------------------------------------------- gallery filters <-> URL query
export const FILTER_KEYS = ['q', 'category', 'subtype', 'color', 'season', 'style', 'status'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type Filters = Partial<Record<FilterKey, string>>;

export function parseFilters(query: string): Filters {
  const p = new URLSearchParams(query);
  const f: Filters = {};
  for (const k of FILTER_KEYS) {
    const v = p.get(k)?.trim();
    if (v) f[k] = k === 'q' ? v.slice(0, 100) : v;
  }
  return f;
}

/** Stable query string (fixed key order, empty values dropped): the same filters always give the same URL. */
export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) if (f[k]?.trim()) p.set(k, f[k]!.trim());
  return p.toString();
}

/** A new category invalidates the chosen subtype. */
export function setFilter(f: Filters, key: FilterKey, value: string): Filters {
  const next = { ...f, [key]: value || undefined };
  if (key === 'category' && value !== f.category) delete next.subtype;
  return next;
}

// ---------------------------------------------------------------- garment form
export type GarmentForm = {
  nickname: string;
  categoryCode: string;
  /** Standard subtype code, or `custom:<id>` for a custom subcategory. */
  subtype: string;
  primaryColor: string;
  extraColors: string[];
  seasons: string[];
  styles: string[];
  purchasePrice: string;
  purchaseCurrency: string;
  purchasedOn: string;
  purchaseStore: string;
  notes: string;
} & Record<WeatherField, string>;

export type FormField = keyof GarmentForm;

export const emptyForm = (): GarmentForm => ({
  nickname: '', categoryCode: '', subtype: '', primaryColor: '', extraColors: [], seasons: [], styles: [],
  purchasePrice: '', purchaseCurrency: '', purchasedOn: '', purchaseStore: '', notes: '',
  warmth: 'UNKNOWN', rain: 'UNKNOWN', windproof: 'UNKNOWN', breathability: 'UNKNOWN', layering: 'UNKNOWN',
});

export const formOf = (g: Garment): GarmentForm => ({
  nickname: g.nickname ?? '',
  categoryCode: g.categoryCode,
  subtype: g.customSubcategory ? `custom:${g.customSubcategory.id}` : (g.subtypeCode ?? ''),
  primaryColor: g.primaryColor.code,
  extraColors: g.extraColors.map((c) => c.code),
  seasons: [...g.seasons],
  styles: [...g.styles],
  purchasePrice: g.purchasePrice === null ? '' : String(g.purchasePrice),
  purchaseCurrency: g.purchaseCurrency ?? '',
  purchasedOn: g.purchasedOn ?? '',
  purchaseStore: g.purchaseStore ?? '',
  notes: g.notes ?? '',
  warmth: g.warmth, rain: g.rain, windproof: g.windproof, breathability: g.breathability, layering: g.layering,
});

/** Error message keys (wardrobe.form.errors.*) found before calling the server. */
export function validateForm(f: GarmentForm): Partial<Record<FormField, 'required' | 'currency' | 'price' | 'tooManyColors'>> {
  const e: Partial<Record<FormField, 'required' | 'currency' | 'price' | 'tooManyColors'>> = {};
  if (!f.categoryCode) e.categoryCode = 'required';
  if (!f.subtype) e.subtype = 'required';
  if (!f.primaryColor) e.primaryColor = 'required';
  if (f.extraColors.length > 4) e.extraColors = 'tooManyColors';
  const price = f.purchasePrice.trim().replace(',', '.');
  if (price && !(/^\d{1,8}(\.\d{1,2})?$/.test(price))) e.purchasePrice = 'price';
  if (f.purchaseCurrency.trim() && !/^[A-Za-z]{3}$/.test(f.purchaseCurrency.trim())) e.purchaseCurrency = 'currency';
  else if (price && !f.purchaseCurrency.trim()) e.purchaseCurrency = 'currency';
  return e;
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

/** API body (create, full PATCH, duplicate overrides): every field explicit, so an edit can also clear one. */
export function toBody(f: GarmentForm) {
  const custom = f.subtype.startsWith('custom:') ? f.subtype.slice(7) : null;
  const price = f.purchasePrice.trim().replace(',', '.');
  return {
    nickname: orNull(f.nickname),
    categoryCode: f.categoryCode,
    subtypeCode: custom ? null : f.subtype || null,
    customSubcategoryId: custom,
    primaryColor: { code: f.primaryColor, shade: null },
    extraColors: f.extraColors.filter((c) => c !== f.primaryColor).map((code) => ({ code, shade: null })),
    seasons: f.seasons,
    styles: f.styles,
    purchasePrice: price ? Number(price) : null,
    purchaseCurrency: orNull(f.purchaseCurrency)?.toUpperCase() ?? null,
    purchasedOn: orNull(f.purchasedOn),
    purchaseStore: orNull(f.purchaseStore),
    notes: orNull(f.notes),
    ...Object.fromEntries(WEATHER.map((k) => [k, f[k]])),
  };
}

const PATH_FIELD: Record<string, FormField> = {
  nickname: 'nickname', categoryCode: 'categoryCode', subtypeCode: 'subtype', customSubcategoryId: 'subtype',
  primaryColor: 'primaryColor', extraColors: 'extraColors', seasons: 'seasons', styles: 'styles',
  purchasePrice: 'purchasePrice', purchaseCurrency: 'purchaseCurrency', purchasedOn: 'purchasedOn', purchaseStore: 'purchaseStore',
  notes: 'notes', warmth: 'warmth', rain: 'rain', windproof: 'windproof', breathability: 'breathability', layering: 'layering',
};

/** Server 400 field errors -> form fields (`primaryColor.code` -> primaryColor). Unknown paths are returned apart. */
export function mapServerErrors(errors: FieldError[]): { fields: Partial<Record<FormField, 'invalid' | 'subtypeMismatch'>>; unmapped: FieldError[] } {
  const fields: Partial<Record<FormField, 'invalid' | 'subtypeMismatch'>> = {};
  const unmapped: FieldError[] = [];
  for (const e of errors) {
    const field = PATH_FIELD[e.path.split('.')[0] ?? ''];
    if (!field) unmapped.push(e);
    else fields[field] ??= /NOT_IN_CATEGORY/.test(e.message) ? 'subtypeMismatch' : 'invalid';
  }
  return { fields, unmapped };
}

// ---------------------------------------------------------------- photos
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export type PhotoProblem = 'limit' | 'size' | 'heic' | 'type';

/** Checks done before any byte is sent (the server checks again, for real, on the content). */
export function checkPhoto(file: { name: string; type: string; size: number }, count: number): PhotoProblem | null {
  if (count >= MAX_PHOTOS) return 'limit';
  if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) return 'heic';
  if (!ACCEPTED.includes(file.type)) return 'type';
  if (file.size > MAX_PHOTO_BYTES) return 'size';
  return null;
}

/** Server answer of an upload -> message key (wardrobe.photos.errors.*). */
export function uploadProblem(status: number, code: string): PhotoProblem | 'damaged' | 'generic' {
  if (status === 413) return 'size';
  if (status === 415) return 'heic'; // unsupported type, HEIC included: same advice (choose a JPEG)
  if (status === 409 && code === 'PHOTO_LIMIT_REACHED') return 'limit';
  if (status === 422 || status === 400) return 'damaged';
  return 'generic';
}

export type LimitKey = 'garments' | 'groups' | 'quota' | 'rateLimited';
/** Per-user caps and budgets of the wardrobe API -> message key (wardrobe.limits.*), null for anything else. */
export function limitKey(status: number, code: string): LimitKey | null {
  if (status === 429) return 'rateLimited';
  if (code === 'GARMENT_LIMIT_REACHED') return 'garments';
  if (code === 'GROUP_LIMIT_REACHED') return 'groups';
  if (code === 'QUOTA_EXCEEDED') return 'quota';
  return null;
}

export const nextRotation = (r: number, delta: 90 | -90) => (r + delta + 360) % 360;

// ---------------------------------------------------------------- bulk + trash
/** Per-garment failures of a bulk answer (`ids.N` for 404, `expectedVersions.<id>` for 409). */
export function bulkFailures(ids: string[], errors: FieldError[]): string[] {
  return errors.flatMap((e) => {
    const [head, rest] = [e.path.split('.')[0], e.path.slice(e.path.indexOf('.') + 1)];
    if (head === 'ids') return ids[Number(rest)] ? [ids[Number(rest)]!] : [];
    if (head === 'expectedVersions') return [rest];
    return [];
  });
}

/** Whole days before the purge (0 on the last day). */
export const daysLeft = (purgeAfter: string, now = Date.now()) => Math.max(0, Math.ceil((new Date(purgeAfter).getTime() - now) / 86_400_000));
