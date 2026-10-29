import Link from 'next/link';
import { wardrobeRoutes } from '@/modules/wardrobe';
import { getMessage } from '@/i18n/messages';
import { EmptyState } from '@/ui/components/EmptyState';
import { Icon } from '@/ui/components/Icon';
import { garmentName, type Garment } from '@/ui/wardrobe';
import { pageLocale, titleFrom } from '../../../page-helpers';
import { getJson, requireAccount } from '../../server-api';
import { loadCatalog } from '../catalog';
import { CARD, H1, LEAD } from '../../styles';
import { RestoreButton } from './RestoreButton';

export const generateMetadata = titleFrom('wardrobe.trash.title');

type Trashed = Garment & { deletedAt: string; purgeAfter: string };

export default async function TrashPage(props: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(props);
  await requireAccount(locale, 'onboarded');
  const catalog = await loadCatalog(locale);
  // ponytail: first 60 only, same as the gallery; add nextCursor paging with it.
  const { items } = await getJson<{ items: Trashed[] }>(wardrobeRoutes.listTrash, '/garments/trash?limit=60', locale);
  const t = (key: string, values?: Record<string, string>) => getMessage(locale, `wardrobe.${key}`).replace(/\{(\w+)\}/g, (_, k) => values?.[k] ?? '');
  const date = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { dateStyle: 'medium', timeZone: 'UTC' });

  return (
    <main className="flex flex-col gap-4 pb-8 font-sans">
      <Link href={`/${locale}/wardrobe`} className="mt-2 inline-flex min-h-11 items-center gap-2 self-start font-bold text-primary">
        <Icon name="back" directional />
        {t('back')}
      </Link>
      <h1 className={H1}>{t('trash.title')}</h1>
      <p className={LEAD}>{t('trash.lead')}</p>

      {items.length === 0 ? (
        <EmptyState title={t('trash.empty')} />
      ) : (
        <ul role="list" className="flex flex-col gap-2.5">
          {items.map((g) => (
            <li key={g.id} className={`${CARD} flex flex-wrap items-center justify-between gap-3 p-3.5`}>
              <div className="flex flex-col gap-0.5">
                <h2 className="text-base font-bold">{garmentName(g, catalog, locale)}</h2>
                <p className="text-sm text-muted">{t('trash.purgeOn', { date: date.format(new Date(g.purgeAfter)) })}</p>
              </div>
              <RestoreButton id={g.id} label={t('trash.restore')} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
