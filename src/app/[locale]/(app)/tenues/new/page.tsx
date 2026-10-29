import { pageLocale, titleFrom } from '../../../page-helpers';
import { requireAccount, timeZones } from '../../server-api';
import { loadCatalog } from '../../dressing/server';
import { EditorPage } from '../EditorPage';
import { isDate } from '../logic';

export const generateMetadata = titleFrom('outfits.editor.newTitle');

export default async function NewOutfitPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<{ date?: string }> }) {
  const locale = await pageLocale(props);
  const { prefs } = await requireAccount(locale, 'onboarded');
  const { date } = await props.searchParams;
  return <EditorPage locale={locale} catalog={await loadCatalog(locale)} outfit={null} timezone={prefs.timezone ?? 'UTC'} zones={timeZones()} date={isDate(date) ? date : undefined} />;
}
