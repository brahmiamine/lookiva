import { notFound } from 'next/navigation';
import { wardrobeRoutes } from '@/modules/wardrobe';
import type { Locale } from '@/i18n/config';
import { getJson } from '../server-api';
import type { Catalog, Custom, Garment, Page } from './types';

type L = { fr: string; en: string; ar: string };
type Item = { code: string; labels: L };

/** Catalog (public reference data) + the user's custom subcategories, labels resolved for `locale`. */
export async function loadCatalog(locale: Locale): Promise<Catalog> {
  const [cats, colors, opts, customs] = await Promise.all([
    getJson<{ items: (Item & { subtypes: Item[] })[] }>(wardrobeRoutes.catalogCategories, '/catalog/categories', locale),
    getJson<{ items: (Item & { hex: string })[] }>(wardrobeRoutes.catalogColors, '/catalog/colors', locale),
    getJson<{ statuses: { code: string }[]; seasons: Item[]; styles: Item[]; weather: Catalog['weather'] }>(wardrobeRoutes.catalogOptions, '/catalog/options', locale),
    // ponytail: first 100 custom subcategories only (API page max); paginate if anyone ever has more.
    getJson<Page<Custom>>(wardrobeRoutes.listCustomSubcategories, '/custom-subcategories?limit=100', locale),
  ]);
  const opt = (i: Item) => ({ code: i.code, label: i.labels[locale] });
  return {
    categories: cats.items.map((c) => ({ ...opt(c), subtypes: c.subtypes.map(opt) })),
    colors: colors.items.map((c) => ({ ...opt(c), hex: c.hex })),
    seasons: opts.seasons.map(opt),
    styles: opts.styles.map(opt),
    statuses: opts.statuses.map((s) => s.code),
    weather: opts.weather,
    customs: customs.items.map(({ id, label, parentSubtypeCode, categoryCode }) => ({ id, label, parentSubtypeCode, categoryCode })),
  };
}

/** The user's garment, or the not-found page (unknown, foreign or trashed id). */
export async function loadGarment(locale: Locale, id: string): Promise<Garment> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  try {
    return await getJson<Garment>((req) => wardrobeRoutes.getGarment(req, id), `/garments/${id}`, locale);
  } catch (e) {
    if (e instanceof Error && e.message.includes('(404)')) notFound();
    throw e;
  }
}
