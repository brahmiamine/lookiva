'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { Icon } from '@/ui/components/Icon';
import { Notice } from '@/ui/components/Notice';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import { daysLeft } from '../logic';
import { garmentName, label, type Catalog, type Page, type TrashedGarment } from '../types';
import { PAGE_TITLE, Placeholder } from '../ui';

/** Trashed garments with the days left before the purge, and restore. No permanent delete here (the purge does it). */
export function Trash({ catalog }: { catalog: Catalog }) {
  const t = useTranslations('wardrobe.trash');
  const c = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const [items, setItems] = useState<TrashedGarment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<(NoticeData & { href?: string }) | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useFocusOn(noticeRef, notice);
  const toLogin = useCallback(() => router.replace(`/${locale}/login`), [router, locale]);

  const load = useCallback(
    async (after?: string) => {
      try {
        const { data } = await api<Page<TrashedGarment>>(`/garments/trash?limit=50${after ? `&cursor=${encodeURIComponent(after)}` : ''}`);
        setItems((list) => (after && list ? [...list, ...data.items] : data.items));
        setCursor(data.nextCursor);
        setFailed(false);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return toLogin();
        if (after) setNotice(genericNotice(e));
        else setFailed(true);
      }
    },
    [toLogin, genericNotice],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is only set after the await
    void load();
  }, [load]);

  async function restore(g: TrashedGarment) {
    if (pending) return;
    setPending(g.id);
    const name = garmentName(g, catalog);
    const drop = () => setItems((list) => list?.filter((x) => x.id !== g.id) ?? null);
    try {
      await api(`/garments/${g.id}/restore`, { method: 'POST' });
      drop();
      setNotice({ tone: 'success', title: t('restoredTitle'), text: t('restoredText', { name }), href: `/${locale}/dressing/${g.id}` });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return toLogin();
      if (e instanceof ApiError && e.status === 410) setNotice({ tone: 'danger', title: t('expiredTitle'), text: t('expiredText', { name }) });
      else if (e instanceof ApiError && e.code === 'CUSTOM_SUBCATEGORY_MISSING') setNotice({ tone: 'danger', title: t('customMissingTitle'), text: t('customMissingText', { name }) });
      else if (e instanceof ApiError && e.status === 404) {
        drop();
        setNotice({ tone: 'warning', title: t('goneTitle'), text: t('goneText', { name }) });
      } else setNotice(genericNotice(e));
    }
    setPending(null);
  }

  return (
    <>
      <h1 className={`${PAGE_TITLE} mt-2`}>{t('title')}</h1>
      <p className="mb-4 text-[15px] text-muted">{t('lead')}</p>
      {notice && (
        <div className="mb-3">
          <Notice ref={noticeRef} {...notice} role={notice.tone === 'success' ? 'status' : 'alert'}>
            {notice.href && <Link href={notice.href} className="mt-1 inline-flex min-h-11 items-center font-bold underline">{t('openRestored')}</Link>}
          </Notice>
        </div>
      )}
      {failed && <ErrorState title={t('loadErrorTitle')} action={<Button variant="danger" onClick={() => load()}>{t('retry')}</Button>} />}
      {!failed && items === null && (
        <p role="status" className="p-6 text-center text-muted">{c('loading')}</p>
      )}
      {items?.length === 0 && <EmptyState title={t('emptyTitle')} description={t('emptyText')} />}
      {items && items.length > 0 && (
        <ul className="flex flex-col gap-2.5" data-testid="trash">
          {items.map((g) => {
            const name = garmentName(g, catalog);
            const days = daysLeft(g.purgeAfter);
            return (
              <li key={g.id} className="flex items-center gap-3 rounded-card border border-neutral-soft bg-surface p-3 shadow-sm">
                <div className="size-14 flex-none overflow-hidden rounded-card">
                  <Placeholder className="size-7" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <h2 className="truncate font-bold"><bdi>{name}</bdi></h2>
                  <p className="text-sm text-muted">{label(catalog.categories, g.categoryCode)}</p>
                  <p className={`flex items-center gap-1 text-sm font-semibold ${days <= 3 ? 'text-danger' : 'text-warning'}`}>
                    <Icon name="clock" />
                    {t('daysLeft', { count: days })}
                  </p>
                </div>
                <Button variant="outline" className="text-sm" onClick={() => restore(g)} aria-disabled={pending === g.id || undefined} aria-label={t('restoreLabel', { name })}>
                  <Icon name="restore" />
                  {t('restore')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {cursor && <Button variant="outline" className={`${BLOCK} mt-4`} onClick={() => load(cursor)}>{t('loadMore')}</Button>}
    </>
  );
}
