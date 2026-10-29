import { wardrobeRoutes } from '@/modules/wardrobe';
import type { Locale } from '@/i18n/config';
import type { Catalog } from '@/ui/wardrobe';
import { getJson } from '../server-api';

type Items<T> = { items: T[] };

/** Reference data for labels and forms. Public on the API, read here with the same in-process call as the other pages. */
export async function loadCatalog(locale: Locale): Promise<Catalog> {
  const [categories, colors, options] = await Promise.all([
    getJson<Items<Catalog['categories'][number]>>(wardrobeRoutes.catalogCategories, '/catalog/categories', locale),
    getJson<Items<Catalog['colors'][number]>>(wardrobeRoutes.catalogColors, '/catalog/colors', locale),
    getJson<{ statuses: Catalog['statuses']; seasons: Catalog['seasons']; styles: Catalog['styles'] }>(wardrobeRoutes.catalogOptions, '/catalog/options', locale),
  ]);
  return { categories: categories.items, colors: colors.items, statuses: options.statuses, seasons: options.seasons, styles: options.styles };
}
