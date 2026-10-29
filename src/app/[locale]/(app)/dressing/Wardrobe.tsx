'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Dialog } from '@/ui/components/Dialog';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { Icon } from '@/ui/components/Icon';
import { Notice } from '@/ui/components/Notice';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import { bulkFailures, filtersToQuery, parseFilters, setFilter, type FilterKey, type Filters } from './logic';
import { garmentName, label, type Catalog, type Garment, type Page } from './types';
import { CHIP, GarmentThumb, PAGE_TITLE, SELECT, StatusPill } from './ui';

const PAGE_SIZE = 24;
type BulkKind = 'SET_STATUS' | 'SET_CATEGORY' | 'DELETE';
type Phase = 'loading' | 'ready' | 'error';

export function Wardrobe({ catalog, initialQuery }: { catalog: Catalog; initialQuery: string }) {
  const t = useTranslations('wardrobe');
  const c = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const [filters, setFilters] = useState<Filters>(() => parseFilters(initialQuery));
  const [search, setSearch] = useState(filters.q ?? '');
  const [items, setItems] = useState<Garment[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [phase, setPhase] = useState<Phase>('loading');
  const [more, setMore] = useState(false);
  const [reload, setReload] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<BulkKind | null>(null);
  const [notice, setNotice] = useState<(NoticeData & { names?: string[] }) | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useFocusOn(noticeRef, notice);

  const query = filtersToQuery(filters);
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);
  const toLogin = useCallback(() => router.replace(`/${locale}/login`), [router, locale]);

  // Filters live in the URL (shareable, survive reload and back): replaceState keeps Next's router in sync.
  useEffect(() => {
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(null, '', url);
  }, [query]);

  // Debounced text search.
  useEffect(() => {
    const id = setTimeout(() => {
      if ((filtersRef.current.q ?? '') === search.trim()) return;
      setPhase('loading');
      setFilters((f) => setFilter(f, 'q', search.trim()));
    }, 350);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let live = true;
    api<Page<Garment>>(`/garments?limit=${PAGE_SIZE}${query ? `&${query}` : ''}`)
      .then(({ data }) => {
        if (!live) return;
        setItems(data.items);
        setCursor(data.nextCursor);
        setPhase('ready');
      })
      .catch((e) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 401) return toLogin();
        setPhase('error');
      });
    return () => {
      live = false;
    };
  }, [query, reload, toLogin]);

  const refresh = () => {
    setPhase('loading');
    setReload((n) => n + 1);
  };
  const change = (key: FilterKey, value: string) => {
    setPhase('loading');
    setFilters((f) => setFilter(f, key, value));
  };
  const clearFilters = () => {
    setSearch('');
    setPhase('loading');
    setFilters({});
  };

  async function loadMore() {
    if (!cursor || more) return;
    setMore(true);
    try {
      const { data } = await api<Page<Garment>>(`/garments?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}${query ? `&${query}` : ''}`);
      setItems((list) => [...list, ...data.items.filter((g) => !list.some((x) => x.id === g.id))]);
      setCursor(data.nextCursor);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return toLogin();
      setNotice(genericNotice(e));
    }
    setMore(false);
  }

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const stopSelecting = () => {
    setSelecting(false);
    setSelected([]);
  };
  const nameOf = (id: string) => {
    const g = items.find((x) => x.id === id);
    return g ? garmentName(g, catalog) : id;
  };

  const category = catalog.categories.find((x) => x.code === filters.category);
  const hasFilters = Object.keys(filters).length > 0;

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 pt-5 pb-3">
        <h1 className={PAGE_TITLE}>{t('title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/${locale}/dressing/organize`} className={`${CHIP}`}>
            <Icon name="tag" />
            {t('organize.short')}
          </Link>
          <Link href={`/${locale}/dressing/trash`} className={`${CHIP}`}>
            <Icon name="trash" />
            {t('trash.short')}
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-3" role="search" aria-label={t('filters.label')}>
        <div className="flex flex-col gap-1">
          <label htmlFor="garment-search" className="text-sm font-bold">
            {t('filters.search')}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted">
              <Icon name="search" />
            </span>
            <input id="garment-search" type="search" value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} className={`${SELECT} ps-10`} placeholder={t('filters.searchHint')} />
          </div>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label={t('filters.category')}>
          <button type="button" className={CHIP} aria-pressed={!filters.category} onClick={() => change('category', '')}>
            {t('filters.all')}
          </button>
          {catalog.categories.map((cat) => (
            <button key={cat.code} type="button" className={CHIP} aria-pressed={filters.category === cat.code} onClick={() => change('category', cat.code)}>
              {cat.label}
            </button>
          ))}
        </div>
        <details className="rounded-card border border-neutral-soft bg-surface p-3" open={Boolean(filters.subtype || filters.color || filters.season || filters.style || filters.status) || undefined}>
          <summary className="flex min-h-11 cursor-pointer items-center font-bold">{t('filters.more')}</summary>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FilterSelect id="f-subtype" label={t('filters.subtype')} value={filters.subtype} onChange={(v) => change('subtype', v)} options={(category?.subtypes ?? catalog.categories.flatMap((x) => x.subtypes))} any={t('filters.any')} />
            <FilterSelect id="f-color" label={t('filters.color')} value={filters.color} onChange={(v) => change('color', v)} options={catalog.colors} any={t('filters.any')} />
            <FilterSelect id="f-season" label={t('filters.season')} value={filters.season} onChange={(v) => change('season', v)} options={catalog.seasons} any={t('filters.any')} />
            <FilterSelect id="f-style" label={t('filters.style')} value={filters.style} onChange={(v) => change('style', v)} options={catalog.styles} any={t('filters.any')} />
            <FilterSelect id="f-status" label={t('filters.status')} value={filters.status} onChange={(v) => change('status', v)} options={catalog.statuses.map((s) => ({ code: s, label: t(`status.${s}` as 'status.AVAILABLE') }))} any={t('filters.any')} />
          </div>
        </details>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {hasFilters ? (
            <Button variant="secondary" className="text-sm" onClick={clearFilters}>
              {t('filters.clear')}
            </Button>
          ) : (
            <span />
          )}
          {phase === 'ready' && items.length > 0 && (
            <Button variant="secondary" className="text-sm" aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
              {selecting ? t('select.done') : t('select.start')}
            </Button>
          )}
        </div>
      </div>

      {notice && (
        <div className="mt-3">
          <Notice ref={noticeRef} {...notice} role={notice.tone === 'success' ? 'status' : 'alert'}>
            {notice.names && (
              <ul className="list-disc ps-5 font-medium">
                {notice.names.map((n) => (
                  <li key={n}>
                    <bdi>{n}</bdi>
                  </li>
                ))}
              </ul>
            )}
          </Notice>
        </div>
      )}

      <h2 className="sr-only">{t('listTitle')}</h2>
      <div className="mt-4" aria-live="polite" aria-busy={phase === 'loading'}>
        {phase === 'loading' && <Skeleton label={c('loading')} />}
        {phase === 'error' && (
          <ErrorState title={t('loadErrorTitle')} description={t('loadErrorText')} action={<Button variant="danger" onClick={refresh}>{t('retry')}</Button>} />
        )}
        {phase === 'ready' && items.length === 0 && (
          hasFilters ? (
            <EmptyState title={t('noMatchTitle')} description={t('noMatchText')} action={<Button variant="outline" onClick={clearFilters}>{t('filters.clear')}</Button>} />
          ) : (
            <EmptyState title={t('emptyTitle')} description={t('emptyText')} action={<Link href={`/${locale}/dressing/new`} className={`${BLOCK} inline-flex items-center justify-center gap-2 rounded-card bg-primary px-4 text-on-primary`}><Icon name="plus" />{t('add')}</Link>} />
          )
        )}
        {phase === 'ready' && items.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="garments">
            {items.map((g) => {
              const name = garmentName(g, catalog);
              const body = (
                <>
                  <div className="relative aspect-[5/4] overflow-hidden">
                    <GarmentThumb garmentId={g.id} />
                  </div>
                  <div className="flex min-w-0 flex-col items-start gap-1.5 p-3">
                    <h3 className="max-w-full truncate text-[15px] font-bold">
                      <bdi>{name}</bdi>
                    </h3>
                    <p className="max-w-full truncate text-xs text-muted">{label(catalog.colors, g.primaryColor.code)}</p>
                    <StatusPill status={g.status} />
                  </div>
                </>
              );
              const on = selected.includes(g.id);
              return (
                <li key={g.id} className={`flex overflow-hidden rounded-card border bg-surface shadow-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${on ? 'border-2 border-primary' : 'border-neutral-soft'}`} data-garment={g.id}>
                  {selecting ? (
                    <label className="relative flex w-full cursor-pointer flex-col">
                      <input type="checkbox" className="absolute end-2 top-2 z-10 size-6 accent-primary focus:outline-none" checked={on} onChange={() => toggle(g.id)} aria-label={t('select.one', { name })} />
                      {body}
                    </label>
                  ) : (
                    <Link href={`/${locale}/dressing/${g.id}`} className="flex w-full flex-col focus:outline-none">
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {phase === 'ready' && cursor && (
          <Button variant="outline" className={`${BLOCK} mt-4`} onClick={loadMore} aria-disabled={more || undefined}>
            {more ? c('loading') : t('loadMore')}
          </Button>
        )}
      </div>

      {!selecting && (
        <Link href={`/${locale}/dressing/new`} className="fixed end-4 bottom-24 z-20 inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-5 font-bold text-on-primary shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <Icon name="plus" />
          {t('add')}
        </Link>
      )}

      {selecting && (
        <div role="region" aria-label={t('select.bar')} className="fixed inset-x-0 bottom-20 z-20 mx-auto flex w-[min(100%-1rem,48rem)] flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lg">
          <p className="me-auto text-sm font-bold" aria-live="polite">
            {t('select.count', { count: selected.length })}
          </p>
          <Button variant="secondary" className="text-sm" disabled={!selected.length} onClick={() => setBulk('SET_STATUS')}>
            {t('bulk.status')}
          </Button>
          <Button variant="secondary" className="text-sm" disabled={!selected.length} onClick={() => setBulk('SET_CATEGORY')}>
            {t('bulk.category')}
          </Button>
          <Button variant="danger" className="text-sm" disabled={!selected.length} onClick={() => setBulk('DELETE')}>
            <Icon name="trash" />
            {t('bulk.delete')}
          </Button>
        </div>
      )}

      <BulkDialog
        kind={bulk}
        ids={selected}
        items={items}
        catalog={catalog}
        onClose={() => setBulk(null)}
        onDone={(n) => {
          setBulk(null);
          stopSelecting();
          setNotice(n);
          refresh();
        }}
        onFailed={(n, ids) => {
          setBulk(null);
          setNotice({ ...n, names: ids.map(nameOf) });
        }}
        onUnauthorized={toLogin}
      />
    </>
  );
}

function FilterSelect({ id, label: text, value, onChange, options, any }: { id: string; label: string; value?: string; onChange: (v: string) => void; options: { code: string; label: string }[]; any: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold">
        {text}
      </label>
      <select id={id} className={SELECT} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Skeleton({ label: text }: { label: string }) {
  return (
    <div role="status">
      <span className="sr-only">{text}</span>
      <ul aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="overflow-hidden rounded-card border border-neutral-soft bg-surface">
            <div className="aspect-[5/4] animate-pulse bg-neutral-soft motion-reduce:animate-none" />
            <div className="flex flex-col gap-2 p-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-soft motion-reduce:animate-none" />
              <div className="h-6 w-1/2 animate-pulse rounded-full bg-neutral-soft motion-reduce:animate-none" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Confirmation + request of a bulk action. All or nothing on the server: a failure names the garments at fault. */
function BulkDialog({
  kind, ids, items, catalog, onClose, onDone, onFailed, onUnauthorized,
}: {
  kind: BulkKind | null;
  ids: string[];
  items: Garment[];
  catalog: Catalog;
  onClose: () => void;
  onDone: (n: NoticeData) => void;
  onFailed: (n: NoticeData, ids: string[]) => void;
  onUnauthorized: () => void;
}) {
  const t = useTranslations('wardrobe');
  const c = useTranslations('common');
  const genericNotice = useErrorNotice();
  const [status, setStatus] = useState('AVAILABLE');
  const [cat, setCat] = useState('');
  const [sub, setSub] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const key = useRef<string>('');

  const category = catalog.categories.find((x) => x.code === cat);
  const customs = catalog.customs.filter((x) => x.categoryCode === cat);
  const n = ids.length;

  async function run() {
    if (busy || !kind) return;
    if (kind === 'SET_CATEGORY' && (!cat || !sub)) return setError(c('required'));
    setBusy(true);
    setError(undefined);
    key.current ||= crypto.randomUUID(); // one intent = one key, kept across a retry
    const custom = sub.startsWith('custom:') ? sub.slice(7) : null;
    const params =
      kind === 'SET_STATUS' ? { status } : kind === 'SET_CATEGORY' ? { categoryCode: cat, subtypeCode: custom ? null : sub, customSubcategoryId: custom } : undefined;
    const expectedVersions = Object.fromEntries(items.filter((g) => ids.includes(g.id)).map((g) => [g.id, g.version]));
    try {
      const { data } = await api<{ affected: number; unchangedIds: string[]; warnings: unknown[] }>('/garments/bulk-actions', {
        method: 'POST',
        idempotent: key.current,
        body: { action: kind, ids, expectedVersions, ...(params ? { params } : {}) },
      });
      key.current = '';
      onDone({
        tone: 'success',
        title: t(`bulk.done.${kind}`, { count: data.affected }),
        text: data.unchangedIds.length ? t('bulk.unchanged', { count: data.unchangedIds.length }) : data.warnings.length ? t('trash.warnings') : undefined,
      });
    } catch (e) {
      key.current = '';
      if (e instanceof ApiError && e.status === 401) return onUnauthorized();
      if (e instanceof ApiError && (e.status === 404 || e.code === 'VERSION_CONFLICT')) {
        const bad = bulkFailures(ids, e.errors);
        onFailed({ tone: 'danger', title: t(e.status === 404 ? 'bulk.notFound' : 'bulk.conflict'), text: t('bulk.nothingChanged') }, bad);
      } else if (e instanceof ApiError && e.status === 400) setError(t('bulk.invalid'));
      else onFailed(genericNotice(e), []);
    }
    setBusy(false);
  }

  const title = kind ? t(`bulk.title.${kind}`, { count: n }) : '';
  return (
    <Dialog open={kind !== null} onOpenChange={(o) => !o && onClose()} title={title} closeLabel={c('close')} description={kind === 'DELETE' ? t('bulk.deleteText') : undefined}>
      {kind === 'SET_STATUS' && (
        <div className="flex flex-col gap-1">
          <label htmlFor="bulk-status" className="text-sm font-bold">{t('filters.status')}</label>
          <select id="bulk-status" className={SELECT} value={status} onChange={(e) => setStatus(e.target.value)}>
            {catalog.statuses.map((s) => (
              <option key={s} value={s}>{t(`status.${s}` as 'status.AVAILABLE')}</option>
            ))}
          </select>
        </div>
      )}
      {kind === 'SET_CATEGORY' && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="bulk-cat" className="text-sm font-bold">{t('form.category')}</label>
            <select id="bulk-cat" className={SELECT} value={cat} onChange={(e) => { setCat(e.target.value); setSub(''); }}>
              <option value="">{t('form.choose')}</option>
              {catalog.categories.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="bulk-sub" className="text-sm font-bold">{t('form.subtype')}</label>
            <select id="bulk-sub" className={SELECT} value={sub} onChange={(e) => setSub(e.target.value)} disabled={!cat}>
              <option value="">{t('form.choose')}</option>
              {category?.subtypes.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
              {customs.length > 0 && (
                <optgroup label={t('form.mine')}>
                  {customs.map((x) => <option key={x.id} value={`custom:${x.id}`}>{x.label}</option>)}
                </optgroup>
              )}
            </select>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-sm font-bold text-danger">{error}</p>}
      <div className="flex flex-col gap-2">
        <Button variant={kind === 'DELETE' ? 'danger' : 'primary'} className={BLOCK} onClick={run} aria-disabled={busy || undefined}>
          {busy ? c('loading') : t('bulk.confirm', { count: n })}
        </Button>
        <Button variant="outline" className={BLOCK} onClick={onClose}>{c('cancel')}</Button>
      </div>
    </Dialog>
  );
}
