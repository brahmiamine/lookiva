import { pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { pageLocale, titleFrom } from '../../page-helpers';
import { requireAccount } from '../server-api';
import { loadCatalog } from './server';
import { Wardrobe } from './Wardrobe';

export const generateMetadata = titleFrom('wardrobe.title');

export default async function DressingPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = await pageLocale(props);
  await requireAccount(locale, 'onboarded');
  const catalog = await loadCatalog(locale);
  const sp = await props.searchParams;
  const query = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))).toString();
  return (
    <main>
      <IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'wardrobe'])}>
        <Wardrobe catalog={catalog} initialQuery={query} />
      </IntlProvider>
    </main>
  );
}
