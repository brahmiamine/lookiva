// The ONLY place that defines garment statuses. Exactly one is current; only RECOMMENDABLE ones feed recommendations.
export const GARMENT_STATUSES = ['AVAILABLE', 'TO_WASH', 'WASHING', 'DRYING', 'IN_REPAIR', 'LENT'] as const;
export type GarmentStatus = (typeof GARMENT_STATUSES)[number];
export const DEFAULT_STATUS: GarmentStatus = 'AVAILABLE';
const RECOMMENDABLE: readonly GarmentStatus[] = ['AVAILABLE'];

export const isGarmentStatus = (v: string): v is GarmentStatus => (GARMENT_STATUSES as readonly string[]).includes(v);
export const isRecommendable = (s: GarmentStatus): boolean => RECOMMENDABLE.includes(s);

/** Manual transitions are any-to-any; the only refusal is "no change". Nothing ever changes a status automatically. */
export const canTransition = (from: GarmentStatus, to: GarmentStatus): boolean => from !== to;

export const STATUS_LABELS: Record<GarmentStatus, { fr: string; en: string; ar: string }> = {
  AVAILABLE: { fr: 'Disponible', en: 'Available', ar: 'متاح' },
  TO_WASH: { fr: 'À laver', en: 'To wash', ar: 'للغسل' },
  WASHING: { fr: 'En lavage', en: 'Washing', ar: 'قيد الغسل' },
  DRYING: { fr: 'En séchage', en: 'Drying', ar: 'قيد التجفيف' },
  IN_REPAIR: { fr: 'En réparation', en: 'In repair', ar: 'قيد الإصلاح' },
  LENT: { fr: 'Prêté', en: 'Lent', ar: 'مُعار' },
};
