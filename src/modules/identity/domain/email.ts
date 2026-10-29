/** Canonical form used for lookups and uniqueness: NFKC, trimmed, lowercased. The display `email` keeps the input. */
export const normalizeEmail = (raw: string): string => raw.normalize('NFKC').trim().toLowerCase();

export const emailLocalPart = (normalized: string): string => normalized.slice(0, normalized.lastIndexOf('@'));
