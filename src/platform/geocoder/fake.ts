import type { CityCandidate, Geocoder, GeoLocale } from './port';

type City = Omit<CityCandidate, 'name'> & { names: Record<GeoLocale, string> };
const c = (fr: string, en: string, ar: string, countryCode: string, latitude: number, longitude: number, timezone: string): City => ({
  names: { fr, en, ar }, countryCode, latitude, longitude, timezone,
});

// Deterministic data, no network. The real provider is an open decision for phase 06 (see runbook, limits ledger).
const CITIES: City[] = [
  c('Paris', 'Paris', 'باريس', 'FR', 48.8566, 2.3522, 'Europe/Paris'),
  c('Lyon', 'Lyon', 'ليون', 'FR', 45.764, 4.8357, 'Europe/Paris'),
  c('Marseille', 'Marseille', 'مرسيليا', 'FR', 43.2965, 5.3698, 'Europe/Paris'),
  c('Toulouse', 'Toulouse', 'تولوز', 'FR', 43.6047, 1.4442, 'Europe/Paris'),
  c('Nice', 'Nice', 'نيس', 'FR', 43.7102, 7.262, 'Europe/Paris'),
  c('Bordeaux', 'Bordeaux', 'بوردو', 'FR', 44.8378, -0.5792, 'Europe/Paris'),
  c('Lille', 'Lille', 'ليل', 'FR', 50.6292, 3.0573, 'Europe/Paris'),
  c('Tunis', 'Tunis', 'تونس', 'TN', 36.8065, 10.1815, 'Africa/Tunis'),
  c('Sfax', 'Sfax', 'صفاقس', 'TN', 34.7406, 10.7603, 'Africa/Tunis'),
  c('Alger', 'Algiers', 'الجزائر', 'DZ', 36.7538, 3.0588, 'Africa/Algiers'),
  c('Oran', 'Oran', 'وهران', 'DZ', 35.6971, -0.6308, 'Africa/Algiers'),
  c('Casablanca', 'Casablanca', 'الدار البيضاء', 'MA', 33.5731, -7.5898, 'Africa/Casablanca'),
  c('Rabat', 'Rabat', 'الرباط', 'MA', 34.0209, -6.8416, 'Africa/Casablanca'),
  c('Marrakech', 'Marrakesh', 'مراكش', 'MA', 31.6295, -7.9811, 'Africa/Casablanca'),
  c('Londres', 'London', 'لندن', 'GB', 51.5074, -0.1278, 'Europe/London'),
  c('Dubaï', 'Dubai', 'دبي', 'AE', 25.2048, 55.2708, 'Asia/Dubai'),
  c('Le Caire', 'Cairo', 'القاهرة', 'EG', 30.0444, 31.2357, 'Africa/Cairo'),
  c('Alexandrie', 'Alexandria', 'الإسكندرية', 'EG', 31.2001, 29.9187, 'Africa/Cairo'),
  c('Montréal', 'Montreal', 'مونتريال', 'CA', 45.5017, -73.5673, 'America/Toronto'),
  c('New York', 'New York', 'نيويورك', 'US', 40.7128, -74.006, 'America/New_York'),
  c('Bruxelles', 'Brussels', 'بروكسل', 'BE', 50.8503, 4.3517, 'Europe/Brussels'),
  c('Genève', 'Geneva', 'جنيف', 'CH', 46.2044, 6.1432, 'Europe/Zurich'),
  c('Madrid', 'Madrid', 'مدريد', 'ES', 40.4168, -3.7038, 'Europe/Madrid'),
  c('Istanbul', 'Istanbul', 'إسطنبول', 'TR', 41.0082, 28.9784, 'Europe/Istanbul'),
  c('Riyad', 'Riyadh', 'الرياض', 'SA', 24.7136, 46.6753, 'Asia/Riyadh'),
  c('Beyrouth', 'Beirut', 'بيروت', 'LB', 33.8938, 35.5018, 'Asia/Beirut'),
];

export const MAX_CANDIDATES = 5;

/** Case-, accent- and diacritic-insensitive key (NFKD without combining marks, so Arabic harakat are ignored too). */
const fold = (s: string): string => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');

export class FakeGeocoder implements Geocoder {
  async search(query: string, locale: GeoLocale): Promise<CityCandidate[]> {
    const q = fold(query);
    if (q === '') return [];
    const scored = CITIES.flatMap((city, i) => {
      const keys = Object.values(city.names).map(fold);
      const rank = keys.some((k) => k.startsWith(q)) ? 0 : keys.some((k) => k.includes(q)) ? 1 : -1;
      return rank < 0 ? [] : [{ city, rank, i }];
    });
    scored.sort((a, b) => a.rank - b.rank || a.i - b.i);
    return scored.slice(0, MAX_CANDIDATES).map(({ city: { names, ...rest } }) => ({ name: names[locale], ...rest }));
  }
}
