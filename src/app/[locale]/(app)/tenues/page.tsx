import { pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { pageLocale, titleFrom } from '../../page-helpers';
import { requireAccount } from '../server-api';
import { Outfits } from './Outfits';

export const generateMetadata = titleFrom('outfits.title');

export default async function OutfitsPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<{ view?: string; date?: string }> }) {
  const locale = await pageLocale(props);
  const { prefs } = await requireAccount(locale, 'onboarded');
  const sp = await props.searchParams;
  return (
    <main>
      <IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'outfits', 'wardrobe'])}>
        <Outfits timezone={prefs.timezone ?? 'UTC'} initialView={sp.view} initialDate={sp.date} />
      </IntlProvider>
    </main>
  );
}
