import { getMessage, pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { pageLocale, titleFrom } from '../../../page-helpers';
import { requireAccount } from '../../server-api';
import { SettingsHeader } from '../../settings/SettingsHeader';
import { loadCatalog } from '../server';
import { Trash } from './Trash';

export const generateMetadata = titleFrom('wardrobe.trash.title');

export default async function TrashPage(props: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(props);
  await requireAccount(locale, 'onboarded');
  const catalog = await loadCatalog(locale);
  return (
    <div className="mx-auto w-full max-w-xl">
      <SettingsHeader title={getMessage(locale, 'wardrobe.title')} backHref={`/${locale}/dressing`} backLabel={getMessage(locale, 'wardrobe.back')} />
      <main>
        <IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'wardrobe'])}>
          <Trash catalog={catalog} />
        </IntlProvider>
      </main>
    </div>
  );
}
