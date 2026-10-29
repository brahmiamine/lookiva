import Link from 'next/link';
import { getMessage, pickMessages } from '@/i18n/messages';
import { Icon } from '@/ui/components/Icon';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { pageLocale, titleFrom } from '../../../page-helpers';
import { requireAccount } from '../../server-api';
import { H1, LEAD } from '../../styles';
import { loadOrganizers } from '../groups';
import { ManageGroups } from './ManageGroups';

export const generateMetadata = titleFrom('wardrobe.organize.manage');

export default async function GroupsPage(props: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(props);
  await requireAccount(locale, 'onboarded');
  const lists = await loadOrganizers(locale);
  return (
    <main className="flex flex-col gap-2 pb-8 font-sans">
      <Link href={`/${locale}/wardrobe`} className="mt-2 inline-flex min-h-11 items-center gap-2 self-start font-bold text-primary">
        <Icon name="back" directional />
        {getMessage(locale, 'wardrobe.back')}
      </Link>
      <h1 className={H1}>{getMessage(locale, 'wardrobe.organize.manage')}</h1>
      <p className={LEAD}>{getMessage(locale, 'wardrobe.organize.title')}</p>
      <IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'wardrobe'])}>
        <ManageGroups lists={lists} />
      </IntlProvider>
    </main>
  );
}
