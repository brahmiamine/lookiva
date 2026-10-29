import { wardrobeRoutes } from '@/modules/wardrobe';
import { getMessage, pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { pageLocale, titleFrom } from '../../../page-helpers';
import { getJson, requireAccount } from '../../server-api';
import { SettingsHeader } from '../../settings/SettingsHeader';
import { GarmentSheet } from '../GarmentSheet';
import { loadCatalog, loadGarment } from '../server';
import type { Organizer, Page } from '../types';

export const generateMetadata = titleFrom('wardrobe.sheet.title');

export default async function GarmentPage(props: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ created?: string; saved?: string }> }) {
  const locale = await pageLocale(props);
  await requireAccount(locale, 'onboarded');
  const { id } = await props.params;
  const sp = await props.searchParams;
  // ponytail: first 100 lists of each kind (API page max) for the membership toggles.
  const list = (r: (req: Request) => Promise<Response>, path: string) => getJson<Page<Organizer>>(r, `${path}?limit=100`, locale).then((p) => p.items);
  const [catalog, garment, tags, collections, sets] = await Promise.all([
    loadCatalog(locale),
    loadGarment(locale, id),
    list(wardrobeRoutes.tags.list, '/tags'),
    list(wardrobeRoutes.collections.list, '/collections'),
    list(wardrobeRoutes.garmentSets.list, '/garment-sets'),
  ]);
  return (
    <div className="mx-auto w-full max-w-xl">
      <SettingsHeader title={getMessage(locale, 'wardrobe.sheet.title')} backHref={`/${locale}/dressing`} backLabel={getMessage(locale, 'wardrobe.back')} />
      <main>
        <IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'wardrobe'])}>
          <GarmentSheet key={garment.version} initial={garment} catalog={catalog} lists={{ tags, collections, 'garment-sets': sets }} flash={sp.created ? 'created' : sp.saved ? 'saved' : null} />
        </IntlProvider>
      </main>
    </div>
  );
}
