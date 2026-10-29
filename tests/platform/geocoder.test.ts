import { describe, expect, it } from 'vitest';
import { FakeGeocoder } from '@/platform';
import { isIanaTimeZone } from '@/modules/identity/domain/preferences';

const g = new FakeGeocoder();

describe('FakeGeocoder', () => {
  it('finds_a_city_ignoring_case_and_accents_and_returns_its_iana_timezone', async () => {
    for (const q of ['montreal', 'MONTRÉAL', '  montréal  ']) {
      const [first] = await g.search(q, 'fr');
      expect(first).toEqual({ name: 'Montréal', countryCode: 'CA', latitude: 45.5017, longitude: -73.5673, timezone: 'America/Toronto' });
    }
    expect((await g.search('Tunis', 'fr'))[0]).toMatchObject({ countryCode: 'TN', timezone: 'Africa/Tunis' });
    expect((await g.search('casablanca', 'en'))[0]?.timezone).toBe('Africa/Casablanca');
  });

  it('matches_a_name_in_any_language_but_answers_in_the_requested_one', async () => {
    expect((await g.search('London', 'fr'))[0]?.name).toBe('Londres');
    expect((await g.search('londres', 'en'))[0]?.name).toBe('London');
    expect((await g.search('Le Caire', 'en'))[0]?.name).toBe('Cairo');
    expect((await g.search('cairo', 'fr'))[0]?.name).toBe('Le Caire');
    expect((await g.search('Alger', 'en'))[0]?.name).toBe('Algiers');
  });

  it('accepts_an_arabic_query_with_or_without_diacritics', async () => {
    expect((await g.search('القاهرة', 'ar'))[0]).toMatchObject({ name: 'القاهرة', countryCode: 'EG', timezone: 'Africa/Cairo' });
    expect((await g.search('بَاريس', 'fr'))[0]?.name).toBe('Paris');
    expect((await g.search('دبي', 'en'))[0]).toMatchObject({ name: 'Dubai', timezone: 'Asia/Dubai' });
  });

  it('returns_at_most_five_prefix_matches_first', async () => {
    const res = await g.search('a', 'fr'); // matches many names
    expect(res.length).toBe(5);
    expect(await g.search('Marseille', 'fr')).toHaveLength(1);
    // "tunis" is a prefix of Tunis only; "ar" contains-matches elsewhere but prefixes rank first
    const ar = await g.search('al', 'en');
    expect(ar[0]?.name).toMatch(/^Al/i);
  });

  it('unknown_or_blank_queries_return_an_empty_list', async () => {
    expect(await g.search('Atlantis', 'en')).toEqual([]);
    expect(await g.search('   ', 'en')).toEqual([]);
  });

  it('every_candidate_has_a_valid_iana_timezone_and_in_range_coordinates', async () => {
    const all = (await Promise.all(['a', 'e', 'i', 'o', 'u', 'ا'].map((q) => g.search(q, 'en')))).flat();
    expect(all.length).toBeGreaterThan(0);
    for (const c of all) {
      expect(isIanaTimeZone(c.timezone), c.name).toBe(true);
      expect(c.countryCode).toMatch(/^[A-Z]{2}$/);
      expect(Math.abs(c.latitude)).toBeLessThanOrEqual(90);
      expect(Math.abs(c.longitude)).toBeLessThanOrEqual(180);
    }
  });
});
