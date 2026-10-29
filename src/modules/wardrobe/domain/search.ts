import { CATEGORIES, COLORS, SEASONS, STYLES } from './catalog';
import { STATUS_LABELS } from './status';

export const SEARCH_DICTIONARY_VERSION = 'text-v1';
export type SearchField = 'category' | 'subtype' | 'color' | 'season' | 'style' | 'status';
export type SearchFilters = Partial<Record<SearchField, string>>;
export type SearchOptions = { q?: string; filters?: SearchFilters; sort?: 'relevance' | 'newest' | 'availability' };
/** Only live, owner-scoped source records may cross this port. Never includes photo/storage keys. */
export type SearchGarment = {
  id: string; nickname: string | null; categoryCode: string; subtypeCode: string | null; customLabel: string | null;
  primaryColorCode: string; extraColorCodes: string[]; seasons: string[]; styles: string[]; status: string;
  notes: string | null; purchaseStore: string | null; tags: string[]; collections: string[]; sets: string[]; createdAt: string;
};
export type SearchMatch = { garment: SearchGarment; score: number; reasons: ('CATALOG' | 'TEXT' | 'FILTER')[] };
export type Intent = { unsupported: boolean; filters: Partial<Record<SearchField, string[]>>; terms: string[]; expanded: { term: string; field: SearchField; codes: string[]; estimated: boolean }[] };

export function normalizeSearch(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

type Entry = { term: string; field: SearchField; code: string };
const entries: Entry[] = [];
const add = (field: SearchField, code: string, terms: string[]) => {
  for (const term of new Set(terms.map(normalizeSearch))) if (term) entries.push({ term, field, code });
};
for (const c of CATEGORIES) {
  add('category', c.code, Object.values(c.labels));
  for (const s of c.subtypes) add('subtype', s.code, Object.values(s.labels));
}
for (const [field, rows] of [['color', COLORS], ['season', SEASONS], ['style', STYLES]] as const) {
  for (const row of rows) add(field, row.code, Object.values(row.labels));
}
for (const [code, labels] of Object.entries(STATUS_LABELS)) add('status', code, Object.values(labels));
// Small, explicitly versioned lexicon. These aliases are not a claim of general dialect/translation support.
add('subtype', 'SNEAKERS', ['basket', 'sneaker', 'trainers', 'سبادري', 'سباط رياضي']);
add('subtype', 'TROUSERS', ['pantalons', 'pants', 'سروال']);
add('subtype', 'DRESS', ['robes', 'dresses']);
add('color', 'BLACK', ['noire', 'noirs', 'noires', 'سوداء', 'كحل']);
add('color', 'WHITE', ['blanche', 'blancs', 'blanches', 'بيضاء']);
add('color', 'BLUE', ['bleue', 'bleus', 'bleues', 'زرقاء']);
add('color', 'GREEN', ['verte', 'verts', 'vertes', 'خضراء']);
add('color', 'GREY', ['gray', 'grise']);
add('status', 'AVAILABLE', ['disponibles', 'متوفر', 'متاحة']);
add('style', 'BUSINESS', ['travail', 'work', 'bureau', 'office', 'للعمل']);
add('season', 'WINTER', ['شتاء']);
add('season', 'SUMMER', ['صيف']);
const stop = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'en', 'et', 'pour', 'a', 'au', 'aux', 'the', 'a', 'an', 'and', 'for', 'in', 'of', 'و', 'في', 'من', 'ل']);
const byPhrase = new Map<string, Entry[]>();
for (const entry of entries) byPhrase.set(entry.term, [...(byPhrase.get(entry.term) ?? []), entry]);
const maxWords = Math.max(...entries.map((e) => e.term.split(' ').length));

/** Bounded catalog-only typo correction; private free text is never fuzzily broadened. */
function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + Number(i < a.length || j < b.length) <= 1;
}

export function parseIntent(q: string): Intent {
  const words = normalizeSearch(q).split(' ').filter(Boolean);
  const result: Intent = { unsupported: false, filters: {}, terms: [], expanded: [] };
  for (let i = 0; i < words.length;) {
    const word = words[i]!;
    let found: Entry[] | undefined;
    let used = 1;
    let estimated = false;
    for (let n = Math.min(maxWords, words.length - i); n >= 1; n--) {
      found = byPhrase.get(words.slice(i, i + n).join(' '));
      if (found) { used = n; break; }
    }
    if (!found && word.length >= 5 && !stop.has(word)) {
      const possible = entries.filter((e) => !e.term.includes(' ') && oneEdit(word, e.term));
      // Ambiguous corrections stay as literal terms instead of silently choosing a meaning.
      if (new Set(possible.map((e) => `${e.field}:${e.code}`)).size === 1) { found = possible; estimated = true; }
    }
    if (found) {
      for (const field of new Set(found.map((e) => e.field))) {
        const codes = [...new Set(found.filter((e) => e.field === field).map((e) => e.code))];
        result.filters[field] = [...new Set([...(result.filters[field] ?? []), ...codes])];
        result.expanded.push({ term: words.slice(i, i + used).join(' '), field, codes, estimated });
      }
    } else if (!stop.has(word)) result.terms.push(word);
    i += used;
  }
  const negations = new Set(['not', 'no', 'without', 'pas', 'non', 'sans', 'غير', 'ليس', 'ليست', 'لا']);
  result.unsupported = result.expanded.length > 0 && words.some((word) => negations.has(word));
  return result;
}

function values(g: SearchGarment, field: SearchField): string[] {
  switch (field) {
    case 'category': return [g.categoryCode];
    case 'subtype': return g.subtypeCode ? [g.subtypeCode] : [];
    case 'color': return [g.primaryColorCode, ...g.extraColorCodes];
    case 'season': return g.seasons;
    case 'style': return g.styles;
    case 'status': return [g.status];
  }
}

export function rankGarments(garments: SearchGarment[], options: SearchOptions): SearchMatch[] {
  const intent = parseIntent(options.q ?? '');
  if (intent.unsupported) return [];
  if (options.q?.trim() && !Object.keys(intent.filters).length && !intent.terms.length) return [];
  const matches: SearchMatch[] = [];
  for (const garment of garments) {
    if (Object.entries(options.filters ?? {}).some(([f, v]) => !values(garment, f as SearchField).includes(v))) continue;
    if (Object.entries(intent.filters).some(([f, codes]) => !codes.some((c) => values(garment, f as SearchField).includes(c)))) continue;
    const text = normalizeSearch([garment.nickname, garment.customLabel, garment.notes, garment.purchaseStore, ...garment.tags, ...garment.collections, ...garment.sets].filter(Boolean).join(' '));
    if (!intent.terms.every((t) => text.includes(t))) continue;
    const reasons: SearchMatch['reasons'] = [];
    if (Object.keys(intent.filters).length) reasons.push('CATALOG');
    if (intent.terms.length) reasons.push('TEXT');
    if (Object.keys(options.filters ?? {}).length) reasons.push('FILTER');
    // Only exact declared properties contribute. Nickname matches outrank notes/group matches.
    const score = Object.keys(intent.filters).length * 10 + intent.terms.reduce((n, t) => n + (normalizeSearch(garment.nickname ?? '').includes(t) ? 5 : 2), 0);
    matches.push({ garment, score, reasons });
  }
  return matches.sort((a, b) => {
    const available = options.sort === 'availability' ? Number(b.garment.status === 'AVAILABLE') - Number(a.garment.status === 'AVAILABLE') : 0;
    const score = !options.sort || options.sort === 'relevance' ? b.score - a.score : 0;
    return available || score || Date.parse(b.garment.createdAt) - Date.parse(a.garment.createdAt) || b.garment.id.localeCompare(a.garment.id);
  });
}
