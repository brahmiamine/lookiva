'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { Button } from '@/ui/components/Button';
import { TextField } from '@/ui/components/TextField';
import { LoadingState } from '@/ui/components/LoadingState';
import { label, type Catalog } from '../dressing/types';
import { PAGE_TITLE, SELECT, StatusPill } from '../dressing/ui';

type Item = { id: string; nickname: string | null; categoryCode: string; subtypeCode: string | null; customLabel: string | null; primaryColorCode: string; status: string; score: number; reasons: ('CATALOG' | 'TEXT' | 'FILTER')[] };
type Result = { items: Item[]; nextCursor?: string; interpretation: { unsupported?: boolean; expanded: { term: string; estimated: boolean }[] } };
type Filters = { category: string; subtype: string; color: string; status: string; season: string; style: string; sort: string };
const initialFilters: Filters = { category: '', subtype: '', color: '', status: '', season: '', style: '', sort: 'relevance' };

export function Search({ catalog }: { catalog: Catalog }) {
  const t = useTranslations('search');
  const c = useTranslations('common');
  const status = useTranslations('wardrobe.status');
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'error' | 'changed' | 'selectionError' | null>(null);
  const lock = useRef(false);
  const [submitted, setSubmitted] = useState<Record<string, string>>({});
  const changed = result !== null && JSON.stringify({ q: query.trim(), ...filters }) !== JSON.stringify(submitted);

  function fail(e: unknown, selection = false) {
    if (e instanceof ApiError && e.status === 401) router.replace(`/${locale}/login`);
    else setError(e instanceof ApiError && e.code === 'INVALID_CURSOR' ? 'changed' : selection ? 'selectionError' : 'error');
  }
  async function search(more = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const input = more ? submitted : { q: query.trim(), ...filters };
    if (!more) { setSelected([]); setResult(null); }
    try {
      const body = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== ''));
      const { data } = await api<Result>('/search/garments', { method: 'POST', body: { ...body, ...(more && result?.nextCursor ? { cursor: result.nextCursor } : {}) } });
      setSubmitted(input);
      setResult(more && result ? { ...data, items: [...result.items, ...data.items.filter((i) => !result.items.some((old) => old.id === i.id))] } : data);
    } catch (e) { fail(e); }
    finally { lock.current = false; setBusy(false); }
  }
  async function prepare() {
    if (lock.current || !selected.length || changed) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api<{ garmentIds: string[] }>('/search/outfit-draft', { method: 'POST', body: { garmentIds: selected } });
      router.push(`/${locale}/tenues/new?garments=${data.garmentIds.join(',')}`);
    } catch (e) { fail(e, true); }
    finally { lock.current = false; setBusy(false); }
  }
  const options = {
    category: catalog.categories,
    subtype: catalog.categories.filter((x) => !filters.category || x.code === filters.category).flatMap((x) => x.subtypes),
    color: catalog.colors, status: catalog.statuses.map((code) => ({ code, label: status(code as 'AVAILABLE') })),
    season: catalog.seasons, style: catalog.styles,
    sort: ['relevance', 'newest', 'availability'].map((code) => ({ code, label: t(`sort.${code}` as 'sort.relevance') })),
  };
  const name = (item: Item) => item.nickname ?? item.customLabel ?? (label(catalog.categories.flatMap((x) => x.subtypes), item.subtypeCode) || label(catalog.categories, item.categoryCode));

  return <>
    <header className="py-6"><h1 className={PAGE_TITLE}>{t('title')}</h1><p className="mt-2 text-sm text-muted">{t('intro')}</p></header>
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void search(); }}>
      <TextField label={t('query')} hint={t('hint')} value={query} maxLength={200} onChange={(e) => setQuery(e.target.value)} type="search" dir="auto" />
      <details className="rounded-card border border-border p-3">
        <summary className="min-h-11 cursor-pointer font-semibold">{t('filters')}</summary>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(Object.keys(options) as (keyof Filters)[]).map((key) => <label key={key} className="flex flex-col gap-1 text-sm font-bold">
            {t(`field.${key}` as 'field.category')}
            <select className={SELECT} value={filters[key]} disabled={busy} onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value, ...(key === 'category' ? { subtype: '' } : {}) }))}>
              {key !== 'sort' && <option value="">{t('all')}</option>}
              {options[key].map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </label>)}
        </div>
      </details>
      <Button variant="primary" type="submit" disabled={busy}>{t('submit')}</Button>
    </form>
    {busy && <LoadingState title={c('loading')} />}
    {error && <p role="alert" className="my-4 text-danger">{t(error)}</p>}
    {changed && <p role="status" className="my-3 text-muted">{t('pending')}</p>}
    {result && <section aria-label={t('results')} aria-busy={busy} className="my-6 space-y-4">
      <p role="status">{t('count', { count: result.items.length })}</p>
      {result.interpretation.expanded.filter((x) => x.estimated).map((x) => <p key={x.term} className="text-sm text-muted">{t('estimated', { term: x.term })}</p>)}
      {result.items.length === 0 && <p>{t(result.interpretation.unsupported ? 'unsupported' : 'empty')}</p>}
      <ul className="space-y-3">{result.items.map((item) => <li key={item.id} className="rounded-card border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          <input type="checkbox" aria-label={name(item)} checked={selected.includes(item.id)} disabled={busy || changed || (!selected.includes(item.id) && selected.length >= 30)} className="size-6 accent-primary" onChange={(e) => setSelected((old) => e.target.checked ? [...old, item.id] : old.filter((id) => id !== item.id))} />
          <Link href={`/${locale}/dressing/${item.id}`} className="min-h-11 min-w-0 flex-1 content-center break-words font-bold text-primary underline" dir="auto">{name(item)}</Link>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2"><StatusPill status={item.status} /><span className="text-sm text-muted">{label(catalog.colors, item.primaryColorCode)}</span></div>
        <p className="mt-2 text-sm text-muted">{item.reasons.map((r) => t(`reason.${r}`)).join(' · ')}</p>
      </li>)}</ul>
      {result.nextCursor && <Button variant="secondary" disabled={busy || changed} onClick={() => void search(true)}>{t('more')}</Button>}
      {selected.length > 0 && <div className="rounded-card border border-border bg-surface p-4">
        <p className="mb-3 text-sm text-muted">{t('draftHint')}</p>
        <Button variant="primary" disabled={busy || changed} onClick={() => void prepare()}>{t('prepare', { count: selected.length })}</Button>
      </div>}
    </section>}
  </>;
}
