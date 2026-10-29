import Link from 'next/link';
import { wardrobeRoutes } from '@/modules/wardrobe';
import { getMessage, pickMessages } from '@/i18n/messages';
import { Icon } from '@/ui/components/Icon';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { garmentName, type Garment } from '@/ui/wardrobe';
import { pageLocale, titleFrom } from '../../../../page-helpers';
import { getJson, requireAccount } from '../../../server-api';
import { loadCatalog } from '../../catalog';
import { H1, LEAD } from '../../../styles';
import { NewOutfitForm } from './NewOutfitForm';

export const generateMetadata = titleFrom('wardrobe.outfits.new');

export default async function NewOutfitPage(props: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(props);
  await requireAccount(locale, 'onboarded');
  const [catalog, { items }] = await Promise.all([loadCatalog(locale), getJson<{ items: Garment[] }>(wardrobeRoutes.listGarments, '/garments?limit=100', locale)]);
  const garments = items.map((g) => ({ id: g.id, name: garmentName(g, catalog, locale) }));
  return (
    <main className="flex flex-col gap-2 pb-8 font-sans">
      <Link href={`/${locale}/wardrobe/outfits`} className="mt-2 inline-flex min-h-11 items-center gap-2 self-start font-bold text-primary">
        <Icon name="back" directional />
        {getMessage(locale, 'wardrobe.back')}
      </Link>
      <h1 className={H1}>{getMessage(locale, 'wardrobe.outfits.new')}</h1>
      <p className={LEAD}>{getMessage(locale, 'wardrobe.outfits.pick')}</p>
      <IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'wardrobe'])}>
        <NewOutfitForm garments={garments} />
      </IntlProvider>
    </main>
  );
}
