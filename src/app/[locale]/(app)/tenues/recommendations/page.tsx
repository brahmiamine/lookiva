import { pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { loadCatalog } from '../../dressing/server';
import { pageLocale, titleFrom } from '../../../page-helpers';
import { requireAccount } from '../../server-api';
import { todayIn } from '../logic';
import { Recommender } from './Recommender';

export const generateMetadata = titleFrom('outfits.recommendations.title');

export default async function RecommendationsPage(props: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(props);
  const [{ prefs }, catalog] = await Promise.all([requireAccount(locale, 'onboarded'), loadCatalog(locale)]);
  const timezone = prefs.timezone ?? 'UTC';
  return <main><IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'outfits', 'wardrobe'])}><Recommender catalog={catalog} timezone={timezone} initialDate={todayIn(timezone)} /></IntlProvider></main>;
}
