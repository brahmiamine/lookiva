// The ONLY place that defines the clothing roles of an outfit item.
export const ROLES = ['TOP', 'BOTTOM', 'ONE_PIECE', 'OUTERWEAR', 'SHOES', 'ACCESSORY', 'OTHER'] as const;
export type Role = (typeof ROLES)[number];

/** Roles a complete outfit is expected to have: a ONE_PIECE, or TOP + BOTTOM; plus SHOES. Missing ones are advisory warnings only. */
export function missingRoles(present: readonly Role[]): Role[] {
  const has = new Set(present);
  const missing: Role[] = [];
  if (!has.has('ONE_PIECE')) {
    if (!has.has('TOP')) missing.push('TOP');
    if (!has.has('BOTTOM')) missing.push('BOTTOM');
  }
  if (!has.has('SHOES')) missing.push('SHOES');
  return missing;
}
