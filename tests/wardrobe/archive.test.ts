import { describe, expect, it } from 'vitest';
import { ARCHIVE_FORMAT, ARCHIVE_VERSION, prevalidateArchive } from '@/modules/wardrobe';

const garment = (o: Record<string, unknown> = {}) => ({ ref: 'g1', categoryCode: 'TOPS', subtypeCode: 'SHIRT', primaryColor: { code: 'BLUE' }, ...o });
const archive = (garments: unknown[], o: Record<string, unknown> = {}) => ({ format: ARCHIVE_FORMAT, version: ARCHIVE_VERSION, garments, ...o });

describe('prevalidateArchive', () => {
  it('accepts_a_valid_v1_manifest_and_counts_garments', () => {
    const r = prevalidateArchive(archive([garment(), garment({ ref: 'g2', status: 'LENT', nickname: 'x' })], { exportedAt: '2026-10-01T10:00:00Z' }));
    expect(r).toEqual({ ok: true, format: 'lookiva-archive', version: 1, counts: { garments: 2, invalidGarments: 0 }, errors: [] });
    expect(prevalidateArchive(archive([])).ok).toBe(true);
  });

  it.each([
    ['null', null, ''],
    ['array', [], ''],
    ['a string', 'x', ''],
    ['wrong format', { format: 'other', version: 1, garments: [] }, '/format'],
    ['future version', archive([], { version: 2 }), '/version'],
    ['missing version', { format: ARCHIVE_FORMAT, garments: [] }, '/version'],
  ])('rejects_%s_with_a_single_pointer_error', (_n, json, path) => {
    const r = prevalidateArchive(json);
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.path).toBe(path);
  });

  it('reports_every_problem_with_a_json_pointer_and_never_throws', () => {
    const r = prevalidateArchive(
      archive([
        garment(),
        garment({ ref: 'g2', primaryColor: { code: 'TEAL' } }),
        garment({ ref: 'g1' }),
        garment({ ref: 'g4', subtypeCode: 'JEANS' }),
        garment({ ref: 'g5', status: 'GONE', extraColors: [{ code: 'RED' }, { code: 'NOPE' }] }),
        garment({ ref: 'g6', customSubcategoryId: '3f8e1b2a-9c4d-4e5f-8a6b-7c8d9e0f1a2b', subtypeCode: null }),
        'not an object',
      ]),
    );
    expect(r.ok).toBe(false);
    expect(r.counts).toEqual({ garments: 7, invalidGarments: 6 });
    const paths = r.errors.map((e) => e.path);
    expect(paths).toContain('/garments/1/primaryColor/code');
    expect(paths).toContain('/garments/2/ref');
    expect(r.errors.find((e) => e.path === '/garments/2/ref')?.code).toBe('DUPLICATE_REF');
    expect(paths).toContain('/garments/3/subtypeCode');
    expect(paths).toContain('/garments/4/status');
    expect(paths).toContain('/garments/4/extraColors/1/code');
    expect(paths).toContain('/garments/5/customSubcategoryId');
    expect(paths).toContain('/garments/6');
  });

  it('refuses_unknown_top_level_keys_and_oversized_ids_and_escapes_pointer_characters', () => {
    expect(prevalidateArchive(archive([], { secret: 1 })).errors[0]?.path).toBe('');
    expect(prevalidateArchive(archive([garment({ ref: 'x'.repeat(65) })])).errors[0]?.path).toBe('/garments/0/ref');
    expect(prevalidateArchive(archive([garment({ 'a/b~c': 1 })])).errors.map((e) => e.path)).toEqual(['/garments/0']);
  });
});
