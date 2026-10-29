export type GeoLocale = 'fr' | 'en' | 'ar';
export type CityCandidate = { name: string; countryCode: string; latitude: number; longitude: number; timezone: string };

export interface Geocoder {
  /** City candidates for a free-text query, best first, at most 5, names in `locale`. Unknown => []. */
  search(query: string, locale: GeoLocale): Promise<CityCandidate[]>;
}
