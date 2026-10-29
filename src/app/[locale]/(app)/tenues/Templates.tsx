'use client';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Dialog } from '@/ui/components/Dialog';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { Notice } from '@/ui/components/Notice';
import { TextField } from '@/ui/components/TextField';
import { useErrorNotice, type NoticeData } from '@/ui/form-helpers';
import type { Page } from '../dressing/types';
import { PAGE_TITLE } from '../dressing/ui';
import { todayIn, zonedInstant, type Outfit, type Template } from './logic';
import { CARD } from './ui';

/** Favourite outfits independent of any date: use on a date (creates a NEW outfit; the template is never modified) or delete. */
export function Templates({ timezone }: { timezone: string }) {
  const t = useTranslations('outfits.templates');
  const o = useTranslations('outfits');
  const c = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const [list, setList] = useState<Template[] | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [use, setUse] = useState<Template | null>(null);
  const [del, setDel] = useState<Template | null>(null);
  const [msg, setMsg] = useState<NoticeData | null>(null);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(todayIn(timezone));
  const [start, setStart] = useState('09:00');
  const [fieldError, setFieldError] = useState(false);
  const toLogin = useCallback(() => router.replace(`/${locale}/login`), [router, locale]);

  useEffect(() => {
    // ponytail: first 100 templates (API page max).
    api<Page<Template>>('/outfit-templates?limit=100')
      .then(({ data }) => { setList(data.items); setError(false); })
      .catch((e) => (e instanceof ApiError && e.status === 401 ? toLogin() : setError(true)));
  }, [reload, toLogin]);

  async function instantiate() {
    if (busy || !use) return;
    if (!date || !start) return setFieldError(true);
    setBusy(true);
    try {
      // PLANNED needs an occasion: a template without one gives a draft to complete.
      const { data } = await api<Outfit>(`/outfit-templates/${use.id}/instantiate`, {
        method: 'POST', idempotent: true, body: { startsAt: zonedInstant(date, start, timezone), timezone, status: use.occasion ? 'PLANNED' : 'DRAFT' },
      });
      router.push(`/${locale}/tenues/${data.id}?created=1`);
      return;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return toLogin();
      setUse(null);
      setMsg(genericNotice(e));
    }
    setBusy(false);
  }

  async function remove() {
    if (busy || !del) return;
    setBusy(true);
    try {
      await api(`/outfit-templates/${del.id}`, { method: 'DELETE' });
      setList((l) => l?.filter((x) => x.id !== del.id) ?? null);
      setMsg({ tone: 'success', title: t('deleted') });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return toLogin();
      setMsg(genericNotice(e));
    }
    setDel(null);
    setBusy(false);
  }

  return (
    <>
      <h1 className={`${PAGE_TITLE} pt-2 pb-3`}>{t('title')}</h1>
      {msg && <div className="mb-3"><Notice {...msg} role={msg.tone === 'success' ? 'status' : 'alert'} /></div>}
      {error ? (
        <ErrorState title={t('loadError')} action={<Button variant="danger" onClick={() => setReload((n) => n + 1)}>{o('retry')}</Button>} />
      ) : list === null ? (
        <p role="status" className="p-6 text-center text-muted">{c('loading')}</p>
      ) : list.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyText')} />
      ) : (
        <ul className="flex flex-col gap-2" data-testid="templates">
          {list.map((x) => (
            <li key={x.id} className={`${CARD} flex flex-col gap-2`}>
              <h2 className="text-base font-extrabold"><bdi>{x.name}</bdi></h2>
              <p className="text-sm text-muted">{x.occasion ? <bdi>{x.occasion}</bdi> : o('noOccasion')} · {o('pieces', { count: x.items.length })}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" className="text-sm" onClick={() => { setFieldError(false); setUse(x); }} aria-label={t('useOne', { name: x.name })}>{t('use')}</Button>
                <Button variant="danger" className="text-sm" onClick={() => setDel(x)} aria-label={t('deleteOne', { name: x.name })}>{t('delete')}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={use !== null} onOpenChange={(v) => !v && setUse(null)} title={t('useTitle', { name: use?.name ?? '' })} description={t('useText')} closeLabel={c('close')}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void instantiate(); }} noValidate>
          <TextField label={t('date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} error={fieldError && !date ? c('required') : undefined} />
          <TextField label={t('start')} type="time" value={start} onChange={(e) => setStart(e.target.value)} error={fieldError && !start ? c('required') : undefined} />
          <Button type="submit" variant="primary" className={BLOCK} aria-disabled={busy || undefined}>{busy ? c('loading') : t('create')}</Button>
          <Button variant="outline" className={BLOCK} onClick={() => setUse(null)}>{c('cancel')}</Button>
        </form>
      </Dialog>

      <Dialog open={del !== null} onOpenChange={(v) => !v && setDel(null)} title={t('deleteTitle', { name: del?.name ?? '' })} description={t('deleteText')} closeLabel={c('close')}>
        <div className="flex flex-col gap-2">
          <Button variant="danger" className={BLOCK} onClick={remove} aria-disabled={busy || undefined}>{t('delete')}</Button>
          <Button variant="outline" className={BLOCK} onClick={() => setDel(null)}>{c('cancel')}</Button>
        </div>
      </Dialog>
    </>
  );
}
