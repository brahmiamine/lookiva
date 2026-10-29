import type { Locale } from '@/i18n/config';
import { getMessage, pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { SettingsHeader } from '../settings/SettingsHeader';
import { GarmentForm, type FormMode } from './GarmentForm';
import type { Catalog } from './types';

/** Shared shell of the create / edit / duplicate pages. */
export function FormPage({ locale, catalog, mode, backHref }: { locale: Locale; catalog: Catalog; mode: FormMode; backHref: string }) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <SettingsHeader title={getMessage(locale, 'wardrobe.title')} backHref={backHref} backLabel={getMessage(locale, 'wardrobe.back')} />
      <main>
        <IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'wardrobe'])}>
          <GarmentForm catalog={catalog} mode={mode} />
        </IntlProvider>
      </main>
    </div>
  );
}
