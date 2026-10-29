import type { Locale } from '@/i18n/config';
import { getMessage, pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { SettingsHeader } from '../settings/SettingsHeader';
import type { Catalog } from '../dressing/types';
import type { Outfit, Role } from './logic';
import { OutfitEditor } from './OutfitEditor';

/** Shared shell of the new / edit outfit pages. */
export function EditorPage(p: { locale: Locale; catalog: Catalog; outfit: Outfit | null; timezone: string; zones: string[]; date?: string; created?: boolean; initialItems?: { garmentId: string; role: Role }[] }) {
  const back = `/${p.locale}/tenues${p.outfit?.localDate ? `?view=day&date=${p.outfit.localDate}` : p.date ? `?view=day&date=${p.date}` : ''}`;
  return (
    <>
      <SettingsHeader title={getMessage(p.locale, 'outfits.editor.pageTitle')} backHref={back} backLabel={getMessage(p.locale, 'outfits.back')} />
      <main>
        <IntlProvider locale={p.locale} messages={pickMessages(p.locale, ['common', 'outfits', 'wardrobe'])}>
          <OutfitEditor key={p.outfit?.id ?? 'new'} catalog={p.catalog} initial={p.outfit} timezone={p.timezone} zones={p.zones} initialDate={p.date} created={p.created} initialItems={p.initialItems} />
        </IntlProvider>
      </main>
    </>
  );
}
