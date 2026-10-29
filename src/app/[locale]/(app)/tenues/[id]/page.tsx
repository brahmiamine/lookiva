import { pageLocale, titleFrom } from '../../../page-helpers';
import { requireAccount, timeZones } from '../../server-api';
import { loadCatalog } from '../../dressing/server';
import { EditorPage } from '../EditorPage';
import { loadOutfit } from '../server';

export const generateMetadata = titleFrom('outfits.editor.pageTitle');

export default async function OutfitPage(props: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ created?: string }> }) {
  const locale = await pageLocale(props);
  const { prefs } = await requireAccount(locale, 'onboarded');
  const { id } = await props.params;
  const [catalog, outfit] = await Promise.all([loadCatalog(locale), loadOutfit(locale, id)]);
  return <EditorPage locale={locale} catalog={catalog} outfit={outfit} timezone={prefs.timezone ?? 'UTC'} zones={timeZones()} created={Boolean((await props.searchParams).created)} />;
}
