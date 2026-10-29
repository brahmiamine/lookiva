// Wardrobe shapes as the browser reads them. The server module is never imported here (it pulls in Redis and Prisma).

export type Labels = { fr: string; en: string; ar: string };
export type Coded = { code: string; labels: Labels };
export type Garment = {
  id: string;
  nickname: string | null;
  categoryCode: string;
  subtypeCode: string | null;
  customSubcategory: { id: string; label: string; parentSubtypeCode: string } | null;
  primaryColor: { code: string; shade: string | null };
  extraColors: { code: string; shade: string | null }[];
  seasons: string[];
  styles: string[];
  notes: string | null;
  purchasePrice: number | null;
  purchaseCurrency: string | null;
  purchasedOn: string | null;
  purchaseStore: string | null;
  warmth: string;
  rain: string;
  windproof: string;
  breathability: string;
  layering: string;
  status: string;
  recommendable: boolean;
  version: number;
};
/** Tag, collection or garment set. `garments` lists every member, trashed ones included. */
export type Organizer = { id: string; name: string; version: number; garments: { id: string; trashed: boolean }[] };
export type GroupKind = 'tags' | 'collections' | 'garment-sets';
export type GroupSet = { kind: GroupKind; items: { id: string; name: string; member: boolean }[] };
export type CustomSubcategory ={ id: string; label: string; parentSubtypeCode: string };
export type Photo ={ id: string; isPrimary: boolean; cutoutStatus: 'READY' | 'FAILED' | null };
export type Catalog = {
  categories: (Coded & { subtypes: Coded[] })[];
  colors: (Coded & { hex: string })[];
  statuses: (Coded & { recommendable: boolean })[];
  seasons: Coded[];
  styles: Coded[];
  weather: Record<string, string[]>;
};

/** The label in the reader's language, French when that one is missing (same rule as the message catalogs). */
export function labelOf(labels: Labels | undefined, locale: string): string {
  return labels?.[locale as keyof Labels] || labels?.fr || '';
}

/** What a garment is called in a list: its nickname, else its custom or standard subtype, else its category. */
export function garmentName(g: Garment, catalog: Catalog, locale: string): string {
  if (g.nickname) return g.nickname;
  if (g.customSubcategory) return g.customSubcategory.label;
  const category = catalog.categories.find((c) => c.code === g.categoryCode);
  const subtype = category?.subtypes.find((s) => s.code === g.subtypeCode);
  return labelOf(subtype?.labels ?? category?.labels, locale);
}

/** Tone of a status badge: AVAILABLE is the only status offered in recommendations, so it is the one that reads as green. */
export type Tone = 'success' | 'warning' | 'info' | 'danger' | 'neutral';
const TONES: Record<string, Tone> = { AVAILABLE: 'success', TO_WASH: 'warning', WASHING: 'info', DRYING: 'info', IN_REPAIR: 'danger', LENT: 'neutral' };
export const statusTone = (code: string): Tone => TONES[code] ?? 'neutral';

export type GarmentForm = { categoryCode: string; subtypeCode: string; customId: string; colorCode: string; nickname: string; seasons: string[]; styles: string[]; notes: string };
export const emptyGarmentForm: GarmentForm = { categoryCode: '', subtypeCode: '', customId: '', colorCode: '', nickname: '', seasons: [], styles: [], notes: '' };

/** Body of POST /garments. A custom subcategory replaces the standard subtype (the server accepts one or the other). Blank text becomes null; weather fields are left to the server default (UNKNOWN). */
export function toCreateBody(f: GarmentForm) {
  return {
    categoryCode: f.categoryCode,
    subtypeCode: f.customId ? null : f.subtypeCode || null,
    customSubcategoryId: f.customId || null,
    primaryColor: { code: f.colorCode, shade: null },
    nickname: f.nickname.trim() || null,
    seasons: f.seasons,
    styles: f.styles,
    notes: f.notes.trim() || null,
  };
}
