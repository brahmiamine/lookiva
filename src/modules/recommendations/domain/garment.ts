// What the engine knows about a garment: categorical attributes only (never photo, name, notes or price).
export type Profile = {
  id: string;
  categoryCode: string;
  subtypeCode: string | null;
  primaryColor: string;
  extraColors: string[];
  warmth: string;
  rain: string;
  windproof: string;
  breathability: string;
  layering: string;
  seasons: string[];
  styles: string[];
};
/** Roles the engine fills. Same strings as outfits' ROLES (checked at compile time in the application layer). */
export type EngineRole = 'TOP' | 'BOTTOM' | 'ONE_PIECE' | 'OUTERWEAR' | 'SHOES';
export type Layer = 'BASE' | 'MID' | 'OUTER';

const SUBTYPE_ROLE: Record<string, EngineRole | null> = {
  SPORTS_TOP: 'TOP', SPORTS_BOTTOM: 'BOTTOM', TRACKSUIT: 'ONE_PIECE', RUNNING_SHOES: 'SHOES', SWIMWEAR: null,
  BABOUCHES: 'SHOES', BURNOUS: 'OUTERWEAR',
};
const CATEGORY_ROLE: Record<string, EngineRole> = {
  TOPS: 'TOP', KNITWEAR: 'TOP', BOTTOMS: 'BOTTOM', ONE_PIECE: 'ONE_PIECE', OUTERWEAR: 'OUTERWEAR', FOOTWEAR: 'SHOES', TRADITIONAL: 'ONE_PIECE',
};
/** null = not part of an everyday outfit proposal (accessories, bags, underwear...: ponytail, accessories are not proposed in v1). */
export function roleOf(g: Pick<Profile, 'categoryCode' | 'subtypeCode'>): EngineRole | null {
  if (g.subtypeCode && g.subtypeCode in SUBTYPE_ROLE) return SUBTYPE_ROLE[g.subtypeCode] as EngineRole | null;
  return CATEGORY_ROLE[g.categoryCode] ?? null;
}

/** Declared layering, else an explicit ASSUMPTION from the category (knitwear = MID). Never persisted. */
export function layerOf(g: Profile): { layer: Layer; assumed: boolean } {
  if (g.layering === 'BASE' || g.layering === 'MID' || g.layering === 'OUTER') return { layer: g.layering, assumed: false };
  if (roleOf(g) === 'OUTERWEAR') return { layer: 'OUTER', assumed: true };
  return { layer: g.categoryCode === 'KNITWEAR' ? 'MID' : 'BASE', assumed: true };
}

const WARMTH = { LIGHT: 1, MEDIUM: 2, WARM: 3, VERY_WARM: 4 } as const;
/** Unknown warmth is assumed MEDIUM (2). */
export const warmthOf = (g: Profile): { value: number; assumed: boolean } =>
  g.warmth in WARMTH ? { value: WARMTH[g.warmth as keyof typeof WARMTH], assumed: false } : { value: 2, assumed: true };
