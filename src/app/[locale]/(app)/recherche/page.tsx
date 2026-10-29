import { pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { pageLocale, titleFrom } from '../../page-helpers';
import { requireAccount } from '../server-api';
import { loadCatalog } from '../dressing/server';
import { Search } from './Search';
export const generateMetadata = titleFrom('search.title');
export default async function SearchPage(props: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(props);
  await requireAccount(locale, 'onboarded');
  return <main><IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'wardrobe', 'search'])}><Search catalog={await loadCatalog(locale)} /></IntlProvider></main>;
}
