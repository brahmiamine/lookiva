import { z } from 'zod';
import { classificationError } from '../domain/garment';
import { GARMENT_STATUSES } from '../domain/status';
import { garmentCreateBody } from './schemas';

/**
 * `lookiva-archive` manifest, garments subset (phase 04 contract; the write path and the other sections come in phase 10).
 * Bump ARCHIVE_VERSION on any incompatible change; readers refuse versions they do not know.
 */
export const ARCHIVE_FORMAT = 'lookiva-archive';
export const ARCHIVE_VERSION = 1;
export const MAX_ARCHIVE_GARMENTS = 5000;

export const archiveGarment = garmentCreateBody.safeExtend({
  /** Id inside the archive only (never reused as a database id). */
  ref: z.string().min(1).max(64),
  status: z.enum(GARMENT_STATUSES).default('AVAILABLE'),
});
export const archiveManifest = z.strictObject({
  format: z.literal(ARCHIVE_FORMAT),
  version: z.literal(ARCHIVE_VERSION),
  exportedAt: z.iso.datetime().optional(),
  garments: z.array(archiveGarment).max(MAX_ARCHIVE_GARMENTS),
});

export type ArchiveError = { path: string; code: string; message: string };
export type ArchiveReport = { ok: boolean; format: string | null; version: number | null; counts: { garments: number; invalidGarments: number }; errors: ArchiveError[] };

const pointer = (path: PropertyKey[]): string => path.map((p) => `/${String(p).replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');

/** Pure, read-only: parses nothing into the database. Every problem is reported with an RFC 6901 JSON pointer. */
export function prevalidateArchive(json: unknown): ArchiveReport {
  const root = typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  const format = typeof root?.format === 'string' ? root.format : null;
  const version = typeof root?.version === 'number' ? root.version : null;
  const report: ArchiveReport = { ok: false, format, version, counts: { garments: 0, invalidGarments: 0 }, errors: [] };
  const fail = (path: string, code: string, message: string) => report.errors.push({ path, code, message });

  if (!root) return fail('', 'NOT_AN_OBJECT', 'the archive must be a JSON object'), report;
  if (format !== ARCHIVE_FORMAT) return fail('/format', 'UNSUPPORTED_FORMAT', `format must be "${ARCHIVE_FORMAT}"`), report;
  if (version !== ARCHIVE_VERSION) return fail('/version', 'UNSUPPORTED_VERSION', `only version ${ARCHIVE_VERSION} is supported`), report;

  const parsed = archiveManifest.safeParse(root);
  const bad = new Set<number>();
  if (!parsed.success) {
    for (const i of parsed.error.issues) {
      fail(pointer(i.path), 'INVALID', i.message);
      if (i.path[0] === 'garments' && typeof i.path[1] === 'number') bad.add(i.path[1]);
    }
  }
  const list = Array.isArray(root.garments) ? root.garments : [];
  report.counts.garments = list.length;
  // Semantic checks on the entries that are well formed: duplicate refs, subtype / custom consistency.
  const seen = new Map<string, number>();
  list.forEach((g, i) => {
    const r = archiveGarment.safeParse(g);
    if (!r.success) return;
    const prev = seen.get(r.data.ref);
    if (prev !== undefined) {
      fail(`/garments/${i}/ref`, 'DUPLICATE_REF', `ref already used by /garments/${prev}`);
      bad.add(i);
    } else seen.set(r.data.ref, i);
    // A custom subcategory cannot travel in this subset: only standard subtypes are importable.
    if (r.data.customSubcategoryId !== null) {
      fail(`/garments/${i}/customSubcategoryId`, 'CUSTOM_SUBCATEGORY_UNSUPPORTED', 'custom subcategories are not part of archive v1: use the standard subtype');
      bad.add(i);
    } else {
      const c = classificationError({ categoryCode: r.data.categoryCode, subtypeCode: r.data.subtypeCode, customParent: null });
      if (c) {
        fail(`/garments/${i}/subtypeCode`, c, 'subtype missing or not part of the category');
        bad.add(i);
      }
    }
  });
  report.counts.invalidGarments = bad.size;
  report.ok = report.errors.length === 0;
  return report;
}
