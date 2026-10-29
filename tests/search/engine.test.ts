import { describe, expect, it } from 'vitest';
import { normalizeSearch, parseIntent, rankGarments, type SearchGarment } from '@/modules/wardrobe/domain/search';

const garment = (extra: Partial<SearchGarment> = {}): SearchGarment => ({
  id: 'a', nickname: 'Mes favoris', categoryCode: 'FOOTWEAR', subtypeCode: 'SNEAKERS', customLabel: null,
  primaryColorCode: 'BLACK', extraColorCodes: [], seasons: ['WINTER'], styles: ['BUSINESS'], status: 'AVAILABLE',
  notes: null, purchaseStore: null, tags: [], collections: [], sets: [], createdAt: '2026-10-20T00:00:00.000Z', ...extra,
});

describe('private trilingual text search', () => {
  it('normalizes accents, Arabic variants, diacritics, tatweel and punctuation', () => {
    expect(normalizeSearch(' ÉTÉ / أَسْوَد ـ إ آ ى ؤ ئ ')).toBe('ete اسود ا ا ي و ي');
  });
  it.each(['baskets noires disponibles pour le travail', 'black sneakers available for work', 'حذاء رياضي أسود متاح للعمل'])('finds the same owned item for %s', (q) => {
    const rows = [garment(), garment({ id: 'red', primaryColorCode: 'RED' }), garment({ id: 'wash', status: 'TO_WASH' })];
    expect(rankGarments(rows, { q }).map((r) => r.garment.id)).toEqual(['a']);
  });
  it('uses longest phrases instead of interpreting navy as plain blue', () => {
    expect(parseIntent('baskets bleu marine').filters.color).toEqual(['NAVY']);
  });
  it('retains unknown terms so they cannot broaden the results', () => {
    expect(rankGarments([garment()], { q: 'baskets licorne' })).toEqual([]);
  });
  it('requires ALL free text terms across private notes and organizers', () => {
    const g = garment({ notes: 'Coton biologique', tags: ['Voyage'], collections: ['Capsule'], sets: ['Week-end'] });
    expect(rankGarments([g], { q: 'coton voyage capsule' })[0]?.reasons).toContain('TEXT');
    expect(rankGarments([g], { q: 'coton laine' })).toEqual([]);
    expect(g.collections).toEqual(['Capsule']);
  });
  it('explicit filters intersect inferred properties and never lose to ranking', () => {
    expect(rankGarments([garment()], { q: 'black sneakers', filters: { color: 'RED' } })).toEqual([]);
    expect(rankGarments([garment()], { filters: { category: 'TOPS' } })).toEqual([]);
  });
  it('matches parent subtype of a custom category and secondary colors', () => {
    expect(rankGarments([garment({ customLabel: 'Course', extraColorCodes: ['RED'] })], { q: 'sneakers', filters: { color: 'RED' } })).toHaveLength(1);
  });
  it('matches documented aliases and bounded catalog typos', () => {
    for (const q of ['basket', 'sneekers', 'سبادري']) expect(rankGarments([garment()], { q })).toHaveLength(1);
    expect(rankGarments([garment()], { q: 'xyzzzzz' })).toEqual([]);
  });
  it('does not turn negation into its opposite', () => {
    expect(rankGarments([garment()], { q: 'not available' })).toEqual([]);
    expect(rankGarments([garment()], { q: 'pas noir' })).toEqual([]);
  });
  it('sorts deterministically by relevance, newest and availability', () => {
    const a = garment({ id: 'a', status: 'TO_WASH', createdAt: '2026-10-29T00:00:00Z' });
    const b = garment({ id: 'b', createdAt: '2026-10-01T00:00:00Z' });
    expect(rankGarments([a, b], { sort: 'newest' }).map((r) => r.garment.id)).toEqual(['a', 'b']);
    expect(rankGarments([a, b], { sort: 'availability' }).map((r) => r.garment.id)).toEqual(['b', 'a']);
    expect(rankGarments([garment({ id: 'a' }), garment({ id: 'b' })], {}).map((r) => r.garment.id)).toEqual(['b', 'a']);
  });
  it('does not strip tokens from an unrecognized or empty punctuation query into a match-all', () => {
    expect(rankGarments([garment()], { q: '%%%' })).toEqual([]);
    expect(rankGarments([garment()], { q: 'pour le' })).toEqual([]);
  });
});

it('does not invert a negated catalog property even when notes contain the negation word', () => {
  const g = garment({ notes: 'not pas sans غير' });
  for (const q of ['not available', 'pas noir', 'sans noir', 'غير متاح']) expect(rankGarments([g], { q })).toEqual([]);
});
