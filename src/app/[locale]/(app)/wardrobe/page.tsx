import Link from 'next/link';
import { wardrobeRoutes } from '@/modules/wardrobe';
import { getMessage } from '@/i18n/messages';
import { EmptyState } from '@/ui/components/EmptyState';
import { garmentName, labelOf, type Garment } from '@/ui/wardrobe';
import { pageLocale, titleFrom } from '../../page-helpers';
import { getJson, requireAccount } from '../server-api';
import { loadCatalog } from './catalog';
import { GalleryList } from './GalleryList';
import { CARD, H1, LEAD } from '../styles';

export const generateMetadata = titleFrom('wardrobe.title');

const FIELD = 'min-h-13 rounded-card border-[1.5px] border-border bg-surface px-3.5 text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const ADD = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-card bg-primary px-4 font-bold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

type Search = Record<string, string | string[] | undefined>;

/** Garment gallery. Filters are plain GET parameters, so the page stays server-rendered and works without JavaScript. */
export default async function WardrobePage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Search> }) {
  const locale = await pageLocale(props);
  await requireAccount(locale, 'onboarded');
  const catalog = await loadCatalog(locale);
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string).trim() : '');

  // Unknown values are dropped rather than sent: a hand-typed URL must not turn into a 400 page.
  const category = catalog.categories.some((c) => c.code === one('category')) ? one('category') : '';
  const status = catalog.statuses.some((s) => s.code === one('status')) ? one('status') : '';
  const q = one('q').slice(0, 100);

  const query = new URLSearchParams({ limit: '60' }); // ponytail: first 60 only; add nextCursor paging when a closet is that big.
  if (category) query.set('category', category);
  if (status) query.set('status', status);
  if (q) query.set('q', q);
  const { items } = await getJson<{ items: Garment[] }>(wardrobeRoutes.listGarments, `/garments?${query}`, locale);

  const filtered = Boolean(category || status || q);
  const t = (key: string) => getMessage(locale, `wardrobe.${key}`);

  return (
    <main className="flex flex-col gap-4 pb-8 font-sans">
      <header className="flex items-end justify-between gap-3 pt-2">
        <div>
          <h1 className={H1}>{t('title')}</h1>
          <p className={LEAD}>{t('lead')}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link href={`/${locale}/wardrobe/outfits`} className="inline-flex min-h-12 items-center px-2 font-bold text-primary underline underline-offset-[3px]">
            {t('outfits.link')}
          </Link>
          <Link href={`/${locale}/wardrobe/groups`} className="inline-flex min-h-12 items-center px-2 font-bold text-primary underline underline-offset-[3px]">
            {t('organize.manage')}
          </Link>
          <Link href={`/${locale}/wardrobe/trash`}className="inline-flex min-h-12 items-center px-2 font-bold text-primary underline underline-offset-[3px]">
            {t('trashLink')}
          </Link>
          <Link href={`/${locale}/wardrobe/new`} className={ADD}>
            {t('add')}
          </Link>
        </div>
      </header>

      <form method="get" role="search" className={`${CARD} grid grid-cols-1 gap-3 p-3.5 sm:grid-cols-[1fr_1fr_2fr_auto]`}>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('category')}
          <select name="category" defaultValue={category} className={FIELD}>
            <option value="">{t('allCategories')}</option>
            {catalog.categories.map((c) => (
              <option key={c.code} value={c.code}>
                {labelOf(c.labels, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('status')}
          <select name="status" defaultValue={status} className={FIELD}>
            <option value="">{t('allStatuses')}</option>
            {catalog.statuses.map((s) => (
              <option key={s.code} value={s.code}>
                {labelOf(s.labels, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('search')}
          <input name="q" type="search" defaultValue={q} maxLength={100} className={FIELD} />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className={`${ADD} w-full sm:w-auto`}>
            {t('filter')}
          </button>
          {filtered && (
            <Link href={`/${locale}/wardrobe`} className="inline-flex min-h-12 items-center px-2 font-bold text-primary underline underline-offset-[3px]">
              {t('resetFilters')}
            </Link>
          )}
        </div>
      </form>

      {items.length === 0 ? (
        <EmptyState title={filtered ? t('emptyFiltered') : t('empty')} description={filtered ? undefined : t('emptyText')} />
      ) : (
        <GalleryList
          items={items.map((g) => ({ id: g.id, name: garmentName(g, catalog, locale), version: g.version, status: g.status, statusLabel: labelOf(catalog.statuses.find((s) => s.code === g.status)?.labels, locale) }))}
          statuses={catalog.statuses.map((s) => ({ code: s.code, label: labelOf(s.labels, locale) }))}
        />
      )}
    </main>
  );
}
