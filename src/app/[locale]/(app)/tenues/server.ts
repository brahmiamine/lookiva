import { notFound } from 'next/navigation';
import { outfitsRoutes } from '@/modules/outfits';
import type { Locale } from '@/i18n/config';
import { getJson } from '../server-api';
import type { Outfit } from './logic';

/** The user's outfit, or the not-found page (unknown or foreign id). */
export async function loadOutfit(locale: Locale, id: string): Promise<Outfit> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  try {
    return await getJson<Outfit>((req) => outfitsRoutes.getOutfit(req, id), `/outfits/${id}`, locale);
  } catch (e) {
    if (e instanceof Error && e.message.includes('(404)')) notFound();
    throw e;
  }
}
