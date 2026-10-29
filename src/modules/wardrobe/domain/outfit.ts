// Outfit statuses. Only a confirmed wear makes an outfit WORN, and a WORN outfit never goes back: a look worn again is a new outfit.
export const OUTFIT_STATUSES = ['DRAFT', 'PLANNED', 'WORN', 'CANCELLED'] as const;
export type OutfitStatus = (typeof OUTFIT_STATUSES)[number];

export const MAX_OUTFIT_ITEMS = 30;

/** Confirming a wear is allowed from a draft or a planned outfit, never from WORN or CANCELLED. */
export const canConfirmWorn = (status: OutfitStatus): boolean => status === 'DRAFT' || status === 'PLANNED';

/**
 * Name of a garment as it is written in a wear snapshot. Read at confirmation time and then frozen, so the history stays
 * readable after the garment is renamed or purged.
 */
export function snapshotName(g: { nickname: string | null; customLabel: string | null; subtypeCode: string | null; categoryCode: string }): string {
  return g.nickname ?? g.customLabel ?? g.subtypeCode ?? g.categoryCode;
}

export type PlanTarget = 'DRAFT' | 'PLANNED' | 'CANCELLED';

/**
 * Planning may change a DRAFT or PLANNED outfit only. Planning needs a start time. WORN is reached by confirmation only,
 * and a WORN or CANCELLED outfit is locked. Returns the refusal code, or null when the change is allowed.
 */
export function planningError(from: OutfitStatus, to: PlanTarget | null, plannedFor: Date | null): 'OUTFIT_LOCKED' | 'PLANNED_NEEDS_START' | null {
  if (from === 'WORN' || from === 'CANCELLED') return 'OUTFIT_LOCKED';
  if (to === 'PLANNED' && plannedFor === null) return 'PLANNED_NEEDS_START';
  return null;
}
