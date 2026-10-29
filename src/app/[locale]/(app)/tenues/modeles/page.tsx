import { getMessage, pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { pageLocale, titleFrom } from '../../../page-helpers';
import { requireAccount } from '../../server-api';
import { SettingsHeader } from '../../settings/SettingsHeader';
import { Templates } from '../Templates';

export const generateMetadata = titleFrom('outfits.templates.title');

export default async function TemplatesPage(props: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(props);
  const { prefs } = await requireAccount(locale, 'onboarded');
  return (
    <>
      <SettingsHeader title={getMessage(locale, 'outfits.title')} backHref={`/${locale}/tenues`} backLabel={getMessage(locale, 'outfits.back')} />
      <main>
        <IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'outfits', 'wardrobe'])}>
          <Templates timezone={prefs.timezone ?? 'UTC'} />
        </IntlProvider>
      </main>
    </>
  );
}
