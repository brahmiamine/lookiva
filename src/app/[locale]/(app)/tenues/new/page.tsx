import { notFound } from 'next/navigation';
import { pageLocale, titleFrom } from '../../../page-helpers';
import { requireAccount, timeZones } from '../../server-api';
import { loadGarment, loadCatalog } from '../../dressing/server';
import { EditorPage } from '../EditorPage';
import { isDate, parseGarmentSelection, roleForCategory } from '../logic';

export const generateMetadata = titleFrom('outfits.editor.newTitle');

export default async function NewOutfitPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<{ date?: string; garments?: string | string[] }> }) {
  const locale = await pageLocale(props);
  const { prefs } = await requireAccount(locale, 'onboarded');
  const { date, garments } = await props.searchParams;
  const ids = parseGarmentSelection(garments);
  if (!ids) notFound();
  // Resolve ownership and trash state again: the search selection can be stale or URL-tampered.
  const selected = await Promise.all(ids.map((id) => loadGarment(locale, id)));
  const initialItems = selected.map((g) => ({ garmentId: g.id, role: roleForCategory(g.categoryCode) }));
  return <EditorPage locale={locale} catalog={await loadCatalog(locale)} outfit={null} initialItems={initialItems} timezone={prefs.timezone ?? 'UTC'} zones={timeZones()} date={isDate(date) ? date : undefined} />;
}
