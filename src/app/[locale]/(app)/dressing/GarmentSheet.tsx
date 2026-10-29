'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Dialog } from '@/ui/components/Dialog';
import { Icon } from '@/ui/components/Icon';
import { Notice } from '@/ui/components/Notice';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import { PhotoManager } from './PhotoManager';
import { WEATHER, etagOf, garmentName, label, type Catalog, type Garment, type Organizer, type OrganizerKind, type Page, type StatusEvent } from './types';
import { CHIP, SELECT, StatusPill } from './ui';

const SECTION = 'mt-6 mb-2 text-[13px] font-extrabold tracking-wide text-muted uppercase';
const CARD = 'rounded-card border border-neutral-soft bg-surface p-3.5 shadow-sm';
const LINK_BTN = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-card px-4 text-base font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export type Lists = Record<OrganizerKind, Organizer[]>;

export function GarmentSheet({ initial, catalog, lists, flash }: { initial: Garment; catalog: Catalog; lists: Lists; flash: 'created' | 'saved' | null }) {
  const t = useTranslations('wardrobe.sheet');
  const w = useTranslations('wardrobe');
  const c = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const [g, setG] = useState(initial);
  const [notice, setNotice] = useState<(NoticeData & { conflict?: boolean }) | null>(
    flash ? { tone: 'success', title: t(flash === 'created' ? 'createdTitle' : 'savedTitle'), text: flash === 'created' ? t('createdText') : undefined } : null,
  );
  const [deleted, setDeleted] = useState<{ warnings: { kind: string; count: number }[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  const deletedRef = useRef<HTMLHeadingElement>(null);
  useFocusOn(noticeRef, notice && !flash ? notice : null);
  useFocusOn(deletedRef, deleted);

  const toLogin = useCallback(() => router.replace(`/${locale}/login`), [router, locale]);
  const name = garmentName(g, catalog);
  const cat = catalog.categories.find((x) => x.code === g.categoryCode);
  const sub = g.customSubcategory?.label ?? label(cat?.subtypes ?? [], g.subtypeCode);
  const fmtDate = (iso: string, withTime = false) =>
    new Intl.DateTimeFormat(`${locale}-u-nu-latn`, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso));

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api<{ warnings: { kind: string; count: number }[] } | undefined>(`/garments/${g.id}`, { method: 'DELETE' });
      setConfirmDelete(false);
      setDeleted({ warnings: r.data?.warnings ?? [] });
    } catch (e) {
      setConfirmDelete(false);
      if (e instanceof ApiError && e.status === 401) return toLogin();
      if (e instanceof ApiError && e.status === 404) setDeleted({ warnings: [] });
      else setNotice(genericNotice(e));
    }
    setBusy(false);
  }

  if (deleted)
    return (
      <div className="flex flex-col gap-3 pt-4">
        <h1 ref={deletedRef} tabIndex={-1} className="text-2xl font-extrabold focus:outline-none">{t('trashedTitle')}</h1>
        <p className="text-muted">{t('trashedText', { name })}</p>
        {deleted.warnings.length > 0 && (
          <Notice tone="warning" title={w('trash.warnings')}>
            <ul className="list-disc ps-5 font-medium">
              {deleted.warnings.map((x, i) => <li key={i}>{t('warning', { kind: x.kind, count: x.count })}</li>)}
            </ul>
          </Notice>
        )}
        <Link href={`/${locale}/dressing/trash`} className={`${LINK_BTN} border-[1.5px] border-primary text-primary`}>{t('openTrash')}</Link>
        <Link href={`/${locale}/dressing`} className={`${LINK_BTN} bg-primary text-on-primary`}>{t('backToWardrobe')}</Link>
      </div>
    );

  return (
    <div className="flex flex-col pb-6">
      {notice && (
        <div className="mb-3">
          <Notice ref={noticeRef} {...notice} role={notice.tone === 'success' ? 'status' : 'alert'}>
            {notice.conflict && (
              <Button variant="outline" className="mt-2 self-start text-sm" onClick={() => window.location.reload()}>{w('form.reload')}</Button>
            )}
          </Notice>
        </div>
      )}
      <PhotoManager garmentId={g.id} name={name} onUnauthorized={toLogin} />

      <h1 className="mt-4 text-2xl font-extrabold">
        <bdi>{name}</bdi>
      </h1>
      <p className="mt-1 text-[15px] font-semibold text-muted">
        {cat?.label ?? g.categoryCode} <span aria-hidden="true" className="rtl:-scale-x-100 inline-block">›</span>
        <span className="sr-only">,</span> <bdi>{sub}</bdi>
      </p>

      <h2 className={SECTION}>{t('colorsSeasons')}</h2>
      <ul className="flex flex-wrap gap-2">
        {[g.primaryColor, ...g.extraColors].map((col) => {
          const color = catalog.colors.find((x) => x.code === col.code);
          return (
            <li key={col.code} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-sm font-semibold">
              <span aria-hidden="true" className="size-4 rounded-full border border-border" style={{ background: color?.hex }} />
              {color?.label ?? col.code}
            </li>
          );
        })}
        {g.seasons.map((s) => <li key={s} className="inline-flex min-h-9 items-center rounded-full bg-neutral-soft px-3 text-sm font-semibold">{label(catalog.seasons, s)}</li>)}
        {g.styles.map((s) => <li key={s} className="inline-flex min-h-9 items-center rounded-full bg-neutral-soft px-3 text-sm font-semibold">{label(catalog.styles, s)}</li>)}
      </ul>

      <StatusSection garment={g} catalog={catalog} onChanged={setG} onUnauthorized={toLogin} />

      <h2 className={SECTION}>{t('weather')}</h2>
      <dl className={`${CARD} grid grid-cols-1 gap-2 sm:grid-cols-2`}>
        {WEATHER.map((f) => (
          <div key={f} className="flex justify-between gap-3">
            <dt className="text-muted">{w(`weather.${f}.label`)}</dt>
            <dd className="font-semibold">{w(`weather.${f}.${g[f]}` as 'weather.warmth.UNKNOWN')}</dd>
          </div>
        ))}
      </dl>

      <h2 className={SECTION}>{t('purchase')}</h2>
      <dl className={`${CARD} flex flex-col gap-2`}>
        <Fact term={t('price')} value={g.purchasePrice !== null && g.purchaseCurrency ? new Intl.NumberFormat(`${locale}-u-nu-latn`, { style: 'currency', currency: g.purchaseCurrency }).format(g.purchasePrice) : null} none={t('none')} />
        <Fact term={t('store')} value={g.purchaseStore} none={t('none')} />
        <Fact term={t('purchasedOn')} value={g.purchasedOn ? fmtDate(g.purchasedOn) : null} none={t('none')} />
      </dl>

      {g.notes && (
        <>
          <h2 className={SECTION}>{t('notes')}</h2>
          <p className={`${CARD} whitespace-pre-line`} dir="auto">{g.notes}</p>
        </>
      )}

      <ListsSection garmentId={g.id} lists={lists} onUnauthorized={toLogin} />

      <div className="mt-6 flex flex-col gap-2">
        <Link href={`/${locale}/dressing/${g.id}/edit`} className={`${LINK_BTN} bg-primary text-on-primary`}>
          <Icon name="edit" />
          {t('edit')}
        </Link>
        <Link href={`/${locale}/dressing/new?from=${g.id}`} className={`${LINK_BTN} border-[1.5px] border-primary text-primary`}>
          <Icon name="copy" />
          {t('duplicate')}
        </Link>
        <div className="mt-4 rounded-card border border-danger-soft p-3">
          <Button variant="danger" className={BLOCK} onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" />
            {t('delete')}
          </Button>
          <p className="mt-1.5 text-sm text-muted">{t('deleteHint')}</p>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete} title={t('deleteTitle')} closeLabel={c('close')} description={t('deleteText')}>
        <div className="flex flex-col gap-2">
          <Button variant="danger" className={BLOCK} onClick={remove} aria-disabled={busy || undefined}>
            <Icon name="trash" />
            {t('delete')}
          </Button>
          <Button variant="outline" className={BLOCK} onClick={() => setConfirmDelete(false)}>{c('cancel')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function Fact({ term, value, none }: { term: string; value: string | null; none: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{term}</dt>
      <dd className="font-semibold">{value ? <bdi>{value}</bdi> : <><span aria-hidden="true">—</span><span className="sr-only">{none}</span></>}</dd>
    </div>
  );
}

/** Current status, manual change (If-Match on the version read) and the dated history. */
function StatusSection({ garment, catalog, onChanged, onUnauthorized }: { garment: Garment; catalog: Catalog; onChanged: (g: Garment) => void; onUnauthorized: () => void }) {
  const t = useTranslations('wardrobe.sheet');
  const w = useTranslations('wardrobe');
  const locale = useLocale();
  const genericNotice = useErrorNotice();
  const ids = useId();
  const [to, setTo] = useState(catalog.statuses.find((s) => s !== garment.status) ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<(NoticeData & { conflict?: boolean }) | null>(null);
  const [history, setHistory] = useState<StatusEvent[] | null>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  useFocusOn(msgRef, msg);

  const loadHistory = useCallback(async () => {
    try {
      setHistory((await api<Page<StatusEvent>>(`/garments/${garment.id}/status-history?limit=20`)).data.items);
    } catch {
      setHistory([]);
    }
  }, [garment.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is only set after the await
    void loadHistory();
  }, [loadHistory]);

  async function change() {
    if (busy || !to) return;
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api<Garment>(`/garments/${garment.id}/status`, { method: 'POST', body: { status: to, note: note.trim() || null }, ifMatch: etagOf(garment.version) });
      onChanged(data);
      setNote('');
      setTo(catalog.statuses.find((s) => s !== data.status) ?? '');
      setMsg({ tone: 'success', title: t('statusChanged', { status: w(`status.${data.status}` as 'status.AVAILABLE') }) });
      void loadHistory();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onUnauthorized();
      if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') setMsg({ tone: 'warning', title: t('statusConflictTitle'), text: t('statusConflictText'), conflict: true });
      else if (e instanceof ApiError && e.code === 'STATUS_UNCHANGED') setMsg({ tone: 'info', title: t('statusUnchanged') });
      else setMsg(genericNotice(e));
    }
    setBusy(false);
  }

  const fmt = (iso: string) => new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  const st = (s: string) => w(`status.${s}` as 'status.AVAILABLE');

  return (
    <>
      <h2 className={SECTION}>{t('status')}</h2>
      <div className={`${CARD} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="sr-only">{t('currentStatus')}</span>
          <StatusPill status={garment.status} />
          {garment.status !== 'AVAILABLE' && <span className="text-xs text-muted">{t('notRecommended')}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${ids}-to`} className="text-sm font-bold">{t('newStatus')}</label>
          <select id={`${ids}-to`} className={SELECT} value={to} onChange={(e) => setTo(e.target.value)}>
            {catalog.statuses.filter((s) => s !== garment.status).map((s) => <option key={s} value={s}>{st(s)}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${ids}-note`} className="text-sm font-bold">{t('statusNote')}</label>
          <input id={`${ids}-note`} className={SELECT} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button variant="outline" className="self-start" onClick={change} aria-disabled={busy || undefined}>{t('changeStatus')}</Button>
        {msg && (
          <Notice ref={msgRef} {...msg} role={msg.tone === 'success' ? 'status' : 'alert'}>
            {msg.conflict && <Button variant="outline" className="mt-2 self-start text-sm" onClick={() => window.location.reload()}>{w('form.reload')}</Button>}
          </Notice>
        )}
      </div>
      <h3 className="mt-4 mb-2 text-sm font-bold">{t('history')}</h3>
      {history === null ? (
        <p className="text-sm text-muted" role="status">{t('historyLoading')}</p>
      ) : (
        <ol className={`${CARD} flex flex-col gap-2`} data-testid="status-history">
          {history.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-x-3 text-sm">
              <span className="font-semibold">{e.fromStatus ? t('transition', { from: st(e.fromStatus), to: st(e.toStatus) }) : t('created', { to: st(e.toStatus) })}{e.note && <span className="font-normal text-muted"> · <bdi>{e.note}</bdi></span>}</span>
              <time dateTime={e.at} className="text-muted" suppressHydrationWarning>{fmt(e.at)}</time>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

const KINDS: OrganizerKind[] = ['tags', 'collections', 'garment-sets'];

/** Membership of this garment in the user's tags, collections and sets (toggle = attach / detach). */
function ListsSection({ garmentId, lists, onUnauthorized }: { garmentId: string; lists: Lists; onUnauthorized: () => void }) {
  const t = useTranslations('wardrobe.organize');
  const locale = useLocale();
  const genericNotice = useErrorNotice();
  const [state, setState] = useState(lists);
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<NoticeData | null>(null);

  async function toggle(kind: OrganizerKind, o: Organizer) {
    if (pending) return;
    setPending(o.id);
    setMsg(null);
    const member = o.garments.some((x) => x.id === garmentId);
    try {
      const { data } = member
        ? await api<Organizer>(`/${kind}/${o.id}/garments/${garmentId}`, { method: 'DELETE' })
        : await api<Organizer>(`/${kind}/${o.id}/garments`, { method: 'POST', body: { garmentIds: [garmentId] } });
      setState((s) => ({ ...s, [kind]: s[kind].map((x) => (x.id === o.id ? data : x)) }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onUnauthorized();
      setMsg(e instanceof ApiError && e.code === 'GROUP_FULL' ? { tone: 'warning', title: t('full') } : genericNotice(e));
    }
    setPending(null);
  }

  const empty = KINDS.every((k) => state[k].length === 0);
  return (
    <>
      <h2 className={SECTION}>{t('title')}</h2>
      {empty ? (
        <p className="text-sm text-muted">
          {t('noneYet')}{' '}
          <Link href={`/${locale}/dressing/organize`} className="font-bold text-primary underline">{t('manage')}</Link>
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {KINDS.filter((k) => state[k].length).map((k) => (
            <fieldset key={k}>
              <legend className="mb-1 text-sm font-bold">{t(`kinds.${k}`)}</legend>
              <div className="flex flex-wrap gap-2">
                {state[k].map((o) => {
                  const on = o.garments.some((x) => x.id === garmentId);
                  return (
                    <button key={o.id} type="button" className={CHIP} aria-pressed={on} aria-disabled={pending === o.id || undefined} onClick={() => toggle(k, o)}>
                      {on && <Icon name="check" />}
                      <bdi>{o.name}</bdi>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <Link href={`/${locale}/dressing/organize`} className="self-start text-sm font-bold text-primary underline min-h-11 inline-flex items-center">{t('manage')}</Link>
        </div>
      )}
      {msg && <div className="mt-2"><Notice {...msg} role="alert" /></div>}
    </>
  );
}
