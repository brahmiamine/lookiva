import { describe, expect, it } from 'vitest';
import { CATEGORIES, COLORS, SEASONS, SHADES, STYLES, SUBTYPE_CATEGORY, categoryOfSubtype } from '@/modules/wardrobe/domain/catalog';
import { classificationError, normalizeLabel, purgeAfter } from '@/modules/wardrobe/domain/garment';
import { DEFAULT_STATUS, GARMENT_STATUSES, canTransition, isRecommendable } from '@/modules/wardrobe/domain/status';

describe('catalog', () => {
  const all = [...CATEGORIES, ...CATEGORIES.flatMap((c) => c.subtypes), ...COLORS, ...SHADES, ...SEASONS, ...STYLES];
  it('has_fr_en_ar_labels_everywhere', () => {
    for (const x of all) for (const l of ['fr', 'en', 'ar'] as const) expect(x.labels[l].trim().length, `${x.code} ${l}`).toBeGreaterThan(0);
  });
  it('has_unique_codes_and_a_reasonable_size', () => {
    const subs = CATEGORIES.flatMap((c) => c.subtypes.map((s) => s.code));
    expect(new Set(subs).size).toBe(subs.length);
    expect(CATEGORIES.map((c) => c.code)).toHaveLength(new Set(CATEGORIES.map((c) => c.code)).size);
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(10);
    expect(subs.length).toBeGreaterThanOrEqual(55);
    expect(COLORS.length).toBe(16);
  });
  it('has_no_gender_based_category', () => {
    const words = /\b(men|man|women|woman|homme|femme|boys?|girls?|ladies|kids?)\b|رجال|نساء/i;
    for (const c of CATEGORIES) for (const l of ['fr', 'en', 'ar'] as const) expect(c.labels[l]).not.toMatch(words);
    expect(CATEGORIES.map((c) => c.code).join()).not.toMatch(/MEN|WOMEN|KIDS/);
  });
  it('maps_every_subtype_to_its_category', () => {
    expect(categoryOfSubtype('TSHIRT')).toBe('TOPS');
    expect(categoryOfSubtype('NOPE')).toBeUndefined();
    expect(SUBTYPE_CATEGORY.size).toBeGreaterThanOrEqual(55);
  });
});

describe('status', () => {
  it('has_exactly_six_statuses_and_starts_available', () => {
    expect([...GARMENT_STATUSES]).toEqual(['AVAILABLE', 'TO_WASH', 'WASHING', 'DRYING', 'IN_REPAIR', 'LENT']);
    expect(DEFAULT_STATUS).toBe('AVAILABLE');
  });
  it('recommends_only_available', () => {
    expect(GARMENT_STATUSES.filter(isRecommendable)).toEqual(['AVAILABLE']);
  });
  it('allows_any_to_any_except_no_change', () => {
    for (const a of GARMENT_STATUSES) for (const b of GARMENT_STATUSES) expect(canTransition(a, b)).toBe(a !== b);
  });
});

describe('classification', () => {
  const base = { categoryCode: 'TOPS', subtypeCode: null, customParent: null };
  it('accepts_a_subtype_of_the_category', () => expect(classificationError({ ...base, subtypeCode: 'SHIRT' })).toBeNull());
  it('rejects_a_subtype_of_another_category', () => expect(classificationError({ ...base, subtypeCode: 'JEANS' })).toBe('SUBTYPE_NOT_IN_CATEGORY'));
  it('requires_subtype_or_custom', () => expect(classificationError(base)).toBe('SUBTYPE_REQUIRED'));
  it('refuses_both', () => expect(classificationError({ ...base, subtypeCode: 'SHIRT', customParent: 'SHIRT' })).toBe('SUBTYPE_AND_CUSTOM'));
  it('accepts_a_custom_whose_parent_is_in_the_category', () => expect(classificationError({ ...base, customParent: 'POLO' })).toBeNull());
  it('rejects_a_custom_whose_parent_is_elsewhere', () => expect(classificationError({ ...base, customParent: 'SNEAKERS' })).toBe('CUSTOM_PARENT_NOT_IN_CATEGORY'));
});

describe('misc', () => {
  it('purges_30_days_after_deletion', () => expect(purgeAfter(new Date('2026-01-01T00:00:00Z')).toISOString()).toBe('2026-01-31T00:00:00.000Z'));
  it('normalizes_labels', () => expect(normalizeLabel('  Chemise   LIN ')).toBe('chemise lin'));
});
