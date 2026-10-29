// Shapes of the wardrobe API as the screens use them (client-safe: no server import).
export type ColorRef = { code: string; shade: string | null };
export type Garment = {
  id: string;
  nickname: string | null;
  categoryCode: string;
  subtypeCode: string | null;
  customSubcategory: { id: string; label: string; parentSubtypeCode: string } | null;
  primaryColor: ColorRef;
  extraColors: ColorRef[];
  seasons: string[];
  styles: string[];
  purchasePrice: number | null;
  purchaseCurrency: string | null;
  purchasedOn: string | null;
  purchaseStore: string | null;
  notes: string | null;
  warmth: string;
  rain: string;
  windproof: string;
  breathability: string;
  layering: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type TrashedGarment = Garment & { deletedAt: string; purgeAfter: string };
export type Photo = { id: string; position: number; isPrimary: boolean; cutoutStatus: 'READY' | 'FAILED' | null; width: number; height: number };
export type StatusEvent = { id: string; fromStatus: string | null; toStatus: string; note: string | null; at: string };
export type Organizer = { id: string; name: string; garments: { id: string; trashed: boolean }[]; version: number };
export type OrganizerKind = 'tags' | 'collections' | 'garment-sets';
export type Page<T> = { items: T[]; nextCursor?: string };

export type Opt = { code: string; label: string };
export type Custom = { id: string; label: string; parentSubtypeCode: string; categoryCode: string };
/** Reference data with labels already in the page locale. */
export type Catalog = {
  categories: (Opt & { subtypes: Opt[] })[];
  colors: (Opt & { hex: string })[];
  seasons: Opt[];
  styles: Opt[];
  statuses: string[];
  weather: Record<WeatherField, string[]>;
  customs: Custom[];
};
export const WEATHER = ['warmth', 'rain', 'windproof', 'breathability', 'layering'] as const;
export type WeatherField = (typeof WEATHER)[number];

/** Weak ETag of a version, exactly what the API sends (`W/"v3"`), so the client can send If-Match without a re-read. */
export const etagOf = (version: number) => `W/"v${version}"`;

export const label = (opts: Opt[], code: string | null | undefined) => opts.find((o) => o.code === code)?.label ?? code ?? '';
/** Name shown for a garment: its nickname, else its subtype (standard or custom), else its category. */
export function garmentName(g: Pick<Garment, 'nickname' | 'categoryCode' | 'subtypeCode' | 'customSubcategory'>, c: Catalog): string {
  if (g.nickname) return g.nickname;
  if (g.customSubcategory) return g.customSubcategory.label;
  const cat = c.categories.find((x) => x.code === g.categoryCode);
  return label(cat?.subtypes ?? [], g.subtypeCode) || cat?.label || g.categoryCode;
}
