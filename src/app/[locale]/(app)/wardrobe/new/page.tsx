import Link from 'next/link';
import { wardrobeRoutes } from '@/modules/wardrobe';
import { getMessage, pickMessages } from '@/i18n/messages';
import { Icon } from '@/ui/components/Icon';
import { IntlProvider } from '@/ui/components/IntlProvider';
import type { CustomSubcategory } from '@/ui/wardrobe';
import { pageLocale, titleFrom } from '../../../page-helpers';
import { getJson, requireAccount } from '../../server-api';
import { loadCatalog } from '../catalog';
import { H1, LEAD } from '../../styles';
import { NewGarmentForm } from './NewGarmentForm';

export const generateMetadata = titleFrom('wardrobe.new.title');

export default async function NewGarmentPage(props: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(props);
  await requireAccount(locale, 'onboarded');
  const catalog = await loadCatalog(locale);
  // ponytail: first 100 custom subcategories only; the form filters them by parent subtype.
  const { items: customs } = await getJson<{ items: CustomSubcategory[] }>(wardrobeRoutes.listCustomSubcategories, '/custom-subcategories?limit=100', locale);
  return (
    <main className="flex flex-col gap-2 pb-8 font-sans">
      <Link href={`/${locale}/wardrobe`} className="mt-2 inline-flex min-h-11 items-center gap-2 self-start font-bold text-primary">
        <Icon name="back" directional />
        {getMessage(locale, 'wardrobe.back')}
      </Link>
      <h1 className={H1}>{getMessage(locale, 'wardrobe.new.title')}</h1>
      <p className={LEAD}>{getMessage(locale, 'wardrobe.new.lead')}</p>
      <IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'wardrobe'])}>
        <NewGarmentForm catalog={catalog} customs={customs} />
      </IntlProvider>
    </main>
  );
}
