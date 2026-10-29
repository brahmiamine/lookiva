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
import { TextField } from '@/ui/components/TextField';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import { etagOf, garmentName, type Catalog, type Garment, type Page } from '../dressing/types';
import { CHIP, PAGE_TITLE, SELECT, StatusPill } from '../dressing/ui';
import { fmtDay } from './Outfits';
import {
  ROLES, checkSchedule, formOf, isEditable, roleForCategory, scheduleBody, type Conflict, type Item, type Outfit, type Role, type ScheduleForm, type WearRecord,
} from './logic';
import { CARD, OutfitStatusPill, SECTION, WarningChips, snapshotName, useGarments } from './ui';
import { WashPanel } from './WashPanel';

type Field = keyof ScheduleForm;
type Msg = NoticeData & { conflict?: boolean; templates?: boolean };
const FIELD_OF: Record<string, Field> = { title: 'title', occasion: 'occasion', startsAt: 'start', endsAt: 'end', timezone: 'timezone' };
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function OutfitEditor({ catalog, initial, timezone, zones, initialDate, created }: { catalog: Catalog; initial: Outfit | null; timezone: string; zones: string[]; initialDate?: string; created?: boolean }) {
  const t = useTranslations('outfits');
  const e = useTranslations('outfits.editor');
  const c = useTranslations('common');
  const ws = useTranslations('wardrobe.status');
  const locale = useLocale();
  const router = useRouter();
  const ids = useId();
  const genericNotice = useErrorNotice();
  const toLogin = useCallback(() => router.replace(`/${locale}/login`), [router, locale]);
  const { garments, load } = useGarments(toLogin);

  const [outfit, setOutfit] = useState(initial);
  const [form, setForm] = useState(() => formOf(initial, timezone, initialDate));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [draftItems, setDraftItems] = useState<{ garmentId: string; role: Role }[]>([]);
  const [msg, setMsg] = useState<Msg | null>(created ? { tone: 'success', title: e('createdTitle') } : null);
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [picker, setPicker] = useState<{ replace?: string } | null>(null);
  const [record, setRecord] = useState<WearRecord | null>(null);
  const [dialog, setDialog] = useState<'wash' | 'cancel' | 'template' | 'invalidate' | null>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const createKey = useRef('');
  const confirmKey = useRef('');
  useFocusOn(msgRef, msg);

  const editable = !outfit || isEditable(outfit.status);
  const items: Pick<Item, 'garmentId' | 'role'>[] = outfit ? outfit.items : draftItems;
  const itemIds = items.map((i) => i.garmentId).join(',');
  const suggestionIds = conflicts.flatMap((x) => x.suggestions).join(',');

  useEffect(() => {
    void load([...itemIds.split(','), ...suggestionIds.split(',')].filter(Boolean));
  }, [itemIds, suggestionIds, load]);

  const reloadConflicts = useCallback(async (o: Outfit | null) => {
    if (!o || !isEditable(o.status)) return setConflicts([]);
    try {
      setConflicts((await api<{ conflicts: Conflict[] }>(`/outfits/${o.id}/conflicts`)).data.conflicts);
    } catch {
      setConflicts([]);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is only set after the await
    void reloadConflicts(outfit);
  }, [outfit, reloadConflicts]);

  useEffect(() => {
    const rid = outfit?.activeWearRecordId;
    if (!rid || record?.id === rid) return;
    api<WearRecord>(`/wear-records/${rid}`).then(({ data }) => setRecord(data)).catch(() => undefined);
  }, [outfit?.activeWearRecordId, record?.id]);

  const nameOf = (id: string) => {
    const g = garments[id];
    if (g) return garmentName(g, catalog);
    const snap = record?.items.find((i) => i.garmentId === id)?.snapshot;
    return snap ? snapshotName(snap, catalog) : g === null ? e('garmentGone') : c('loading');
  };

  function fail(err: unknown) {
    if (err instanceof ApiError && err.status === 401) return toLogin();
    if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') return setMsg({ tone: 'warning', title: e('conflictTitle'), text: e('conflictText'), conflict: true });
    if (err instanceof ApiError && err.code === 'GARMENT_ALREADY_IN_OUTFIT') return setMsg({ tone: 'warning', title: e('alreadyIn') });
    if (err instanceof ApiError && err.code === 'OUTFIT_FULL') return setMsg({ tone: 'warning', title: e('full') });
    if (err instanceof ApiError && err.code === 'OUTFIT_EMPTY') return setMsg({ tone: 'warning', title: e('wornNeedsItems') });
    if (err instanceof ApiError && err.code === 'OUTFIT_NOT_EDITABLE') return setMsg({ tone: 'warning', title: e('notEditable'), conflict: true });
    if (err instanceof ApiError && err.status === 404) return setMsg({ tone: 'danger', title: e('garmentGone') });
    setMsg(genericNotice(err));
  }

  /** One server mutation of the outfit (If-Match on the version shown), the answer becomes the state. */
  async function run(req: () => Promise<{ data: Outfit }>, done?: NoticeData) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      setOutfit((await req()).data);
      if (done) setMsg(done);
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  }
  const ifMatch = () => etagOf(outfit!.version);

  function addGarment(g: Garment) {
    setPicker(null);
    const role = roleForCategory(g.categoryCode);
    if (!outfit) return setDraftItems((l) => [...l, { garmentId: g.id, role }]);
    void run(() => api<Outfit>(`/outfits/${outfit.id}/items`, { method: 'POST', body: { garmentId: g.id, role }, ifMatch: ifMatch() }));
  }
  function replace(from: string, to: string, done?: NoticeData) {
    setPicker(null);
    if (!outfit) return setDraftItems((l) => l.map((i) => (i.garmentId === from ? { ...i, garmentId: to } : i)));
    void run(() => api<Outfit>(`/outfits/${outfit.id}/items/${from}`, { method: 'PUT', body: { garmentId: to }, ifMatch: ifMatch() }), done);
  }
  function setRole(id: string, role: Role) {
    if (!outfit) return setDraftItems((l) => l.map((i) => (i.garmentId === id ? { ...i, role } : i)));
    void run(() => api<Outfit>(`/outfits/${outfit.id}/items/${id}`, { method: 'PUT', body: { garmentId: id, role }, ifMatch: ifMatch() }));
  }
  function remove(id: string) {
    if (!outfit) return setDraftItems((l) => l.filter((i) => i.garmentId !== id));
    void run(() => api<Outfit>(`/outfits/${outfit.id}/items/${id}`, { method: 'DELETE', ifMatch: ifMatch() }));
  }

  async function save(plan: boolean) {
    if (busy) return;
    const local = checkSchedule(form);
    setErrors(Object.fromEntries(Object.entries(local).map(([k, v]) => [k, e(`errors.${v}`)])));
    if (Object.keys(local).length) return setMsg({ tone: 'danger', title: e('fixErrors') });
    setBusy(true);
    setMsg(null);
    const body = { ...scheduleBody(form), ...(plan ? { status: 'PLANNED' } : {}) };
    try {
      if (!outfit) {
        createKey.current ||= crypto.randomUUID();
        const { data } = await api<Outfit>('/outfits', { method: 'POST', idempotent: createKey.current, body: { ...body, status: plan ? 'PLANNED' : 'DRAFT', items: draftItems } });
        router.replace(`/${locale}/tenues/${data.id}?created=1`);
        return;
      }
      const { data } = await api<Outfit>(`/outfits/${outfit.id}`, { method: 'PATCH', body, ifMatch: ifMatch() });
      setOutfit(data);
      setMsg({ tone: 'success', title: e(plan ? 'plannedTitle' : 'savedTitle') });
    } catch (err) {
      createKey.current = '';
      if (err instanceof ApiError && err.status === 400 && err.errors.length) {
        setErrors(Object.fromEntries(err.errors.flatMap((x) => (FIELD_OF[x.path] ? [[FIELD_OF[x.path], e(plan && /required/.test(x.message) ? 'errors.required' : 'errors.invalid')]] : []))));
        setMsg({ tone: 'danger', title: e(plan ? 'planNeeds' : 'fixErrors') });
      } else fail(err);
    }
    setBusy(false);
  }

  async function refetch() {
    const { data } = await api<Outfit>(`/outfits/${outfit!.id}`);
    setOutfit(data);
    return data;
  }

  async function confirmWorn() {
    if (busy || !outfit) return;
    setBusy(true);
    setMsg(null);
    confirmKey.current ||= crypto.randomUUID(); // one intent, kept across a network retry
    try {
      const { data } = await api<{ outfit: Outfit; wearRecord: WearRecord }>(`/outfits/${outfit.id}/confirm-worn`, {
        method: 'POST', idempotent: confirmKey.current, body: { expectedVersion: outfit.version, timezone: browserZone() },
      });
      confirmKey.current = '';
      await load(data.wearRecord.items.flatMap((i) => (i.garmentId ? [i.garmentId] : [])), true); // current statuses for the panel
      setRecord(data.wearRecord);
      setOutfit(data.outfit);
      setMsg({ tone: 'success', title: e('wornTitle'), text: e('wornText') });
      setDialog('wash');
    } catch (err) {
      confirmKey.current = '';
      if (err instanceof ApiError && err.code === 'ALREADY_WORN') {
        setMsg({ tone: 'info', title: e('alreadyWorn') });
        await refetch().catch(() => undefined);
      } else if (err instanceof ApiError && err.status === 400) setMsg({ tone: 'warning', title: e('wornNeedsItems') });
      else fail(err);
    }
    setBusy(false);
  }

  async function act(fn: () => Promise<unknown>, done: Msg) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      setDialog(null);
      setMsg(done);
    } catch (err) {
      setDialog(null);
      fail(err);
    }
    setBusy(false);
  }

  const warnings = (outfit?.warnings ?? []).map((w) =>
    w.code === 'MISSING_ROLE' ? t('warnings.MISSING_ROLE', { role: t(`role.${w.role as Role}`) })
    : w.code === 'GARMENT_TRASHED' ? t('warnings.GARMENT_TRASHED', { name: nameOf(w.garmentId!) })
    : t('warnings.GARMENT_UNAVAILABLE', { name: nameOf(w.garmentId!), status: ws(w.status as 'AVAILABLE') }),
  );
  const washLines = (record?.items ?? []).flatMap((i) => (i.garmentId && garments[i.garmentId] !== null ? [{ garmentId: i.garmentId, name: nameOf(i.garmentId), status: garments[i.garmentId]?.status ?? null }] : []));
  const field = (k: Field) => ({ value: form[k], error: errors[k], onChange: (ev: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: ev.target.value })) });

  return (
    <div className="flex flex-col pb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <h1 className={PAGE_TITLE}>{outfit ? <bdi>{outfit.title || t('untitled')}</bdi> : e('newTitle')}</h1>
        {outfit && <OutfitStatusPill status={outfit.status} />}
      </div>
      {outfit?.localDate && <p className="mt-1 font-semibold text-muted">{fmtDay(locale, outfit.localDate)}{outfit.localTime && <> · <span dir="ltr">{outfit.localTime}</span></>}</p>}

      {msg && (
        <div className="mt-3">
          <Notice ref={msgRef} {...msg} role={msg.tone === 'success' || msg.tone === 'info' ? 'status' : 'alert'}>
            {msg.conflict && <Button variant="outline" className="mt-2 self-start text-sm" onClick={() => window.location.reload()}>{e('reload')}</Button>}
            {msg.templates && <Link href={`/${locale}/tenues/modeles`} className="mt-1 inline-flex min-h-11 items-center font-bold underline">{e('openTemplates')}</Link>}
          </Notice>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-3">
          <WarningChips items={warnings} label={t('warnings.label')} />
        </div>
      )}

      {editable && (
        <form className="mt-2 flex flex-col gap-3" onSubmit={(ev) => { ev.preventDefault(); void save(false); }} noValidate>
          <h2 className={SECTION}>{e('details')}</h2>
          <TextField label={e('title')} maxLength={120} {...field('title')} />
          <TextField label={e('occasion')} hint={e('occasionHint')} maxLength={80} {...field('occasion')} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TextField label={e('date')} type="date" {...field('date')} />
            <TextField label={e('start')} type="time" {...field('start')} />
            <TextField label={e('end')} type="time" hint={e('endHint')} {...field('end')} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${ids}-tz`} className="text-sm font-bold">{e('timezone')}</label>
            <select id={`${ids}-tz`} dir="ltr" className={SELECT} value={form.timezone} onChange={(ev) => setForm((f) => ({ ...f, timezone: ev.target.value }))}>
              {(zones.includes(form.timezone) ? zones : [form.timezone, ...zones]).map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <p className="text-sm text-muted">{e('planHint')}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" variant={outfit?.status === 'PLANNED' ? 'primary' : 'outline'} className={BLOCK} aria-disabled={busy || undefined}>
              {e(outfit ? 'save' : 'saveDraft')}
            </Button>
            {outfit?.status !== 'PLANNED' && (
              <Button variant="primary" className={BLOCK} onClick={() => save(true)} aria-disabled={busy || undefined}>{e('plan')}</Button>
            )}
          </div>
        </form>
      )}

      <h2 className={SECTION}>{e('items')}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{e('noItems')}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="outfit-items">
          {items.map((i) => {
            const g = garments[i.garmentId];
            const name = nameOf(i.garmentId);
            return (
              <li key={i.garmentId} className={`${CARD} flex flex-col gap-2`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold"><bdi>{name}</bdi></span>
                  {g && <StatusPill status={g.status} />}
                </div>
                {g && g.status !== 'AVAILABLE' && editable && (
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-warning"><Icon name="warn" />{e('unavailable')}</p>
                )}
                {editable ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex min-w-32 flex-1 flex-col gap-1">
                      <label htmlFor={`${ids}-role-${i.garmentId}`} className="text-sm font-bold">{e('role')}</label>
                      <select id={`${ids}-role-${i.garmentId}`} className={SELECT} value={i.role} onChange={(ev) => setRole(i.garmentId, ev.target.value as Role)} aria-describedby={`${ids}-n-${i.garmentId}`}>
                        {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                      </select>
                      <span id={`${ids}-n-${i.garmentId}`} className="sr-only">{name}</span>
                    </div>
                    <Button variant="secondary" className="text-sm" onClick={() => setPicker({ replace: i.garmentId })} aria-label={e('replaceOne', { name })}>
                      <Icon name="rotateCw" />{e('replace')}
                    </Button>
                    <Button variant="danger" className="text-sm" onClick={() => remove(i.garmentId)} aria-label={e('removeOne', { name })}>
                      <Icon name="close" />{e('remove')}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted">{t(`role.${i.role}`)}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable && (
        <Button variant="outline" className={`${BLOCK} mt-3`} onClick={() => setPicker({})} aria-disabled={items.length >= 12 || undefined}>
          <Icon name="plus" />{e('addGarment')}
        </Button>
      )}

      {outfit && editable && (
        <section aria-labelledby={`${ids}-conflicts`}>
          <h2 id={`${ids}-conflicts`} className={SECTION}>{e('conflicts.title')}</h2>
          {conflicts.length === 0 ? (
            <p className="text-sm text-muted">{e('conflicts.none')}</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="conflicts">
              {conflicts.map((x, n) => (
                <li key={`${x.kind}-${x.garmentId}-${x.otherOutfitId ?? n}`} className="flex flex-col gap-2 rounded-card border-[1.5px] border-warning bg-warning-soft p-3 text-sm">
                  <p className="flex items-start gap-1.5 font-semibold text-warning">
                    <Icon name="warn" className="mt-0.5" />
                    <span>{e(`conflicts.${x.kind}`, { name: nameOf(x.garmentId), status: x.status ? ws(x.status as 'AVAILABLE') : '' })}</span>
                  </p>
                  {x.otherOutfitId && <Link href={`/${locale}/tenues/${x.otherOutfitId}`} className="inline-flex min-h-11 items-center self-start font-bold text-primary underline">{e('conflicts.seeOther')}</Link>}
                  {x.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {x.suggestions.map((s) => (
                        <Button key={s} variant="secondary" className="text-sm" onClick={() => replace(x.garmentId, s, { tone: 'success', title: e('conflicts.replaced') })}>
                          {e('conflicts.replaceWith', { name: nameOf(s) })}
                        </Button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {outfit && (
        <section aria-labelledby={`${ids}-actions`} className="mt-6 flex flex-col gap-2">
          <h2 id={`${ids}-actions`} className="sr-only">{e('actions')}</h2>
          {editable && (
            <>
              <Button variant="primary" className={BLOCK} onClick={confirmWorn} aria-disabled={busy || !outfit.items.length || undefined}>
                <Icon name="check" />{e('markWorn')}
              </Button>
              <p className="text-sm text-muted">{e('markWornHint')}</p>
            </>
          )}
          {outfit.status === 'WORN' && record && (
            <div className={`${CARD} flex flex-col gap-2`}>
              <p className="font-bold">{e('wornOn', { date: fmtDay(locale, record.localDate) })}</p>
              <Button variant="outline" className={BLOCK} onClick={async () => { await load(washLines.map((l) => l.garmentId), true); setDialog('wash'); }}>
                <Icon name="drop" />{e('chooseWash')}
              </Button>
              <Button variant="secondary" className={BLOCK} onClick={() => setDialog('invalidate')}>{e('invalidate')}</Button>
            </div>
          )}
          <Button variant="outline" className={BLOCK} onClick={() => setDialog('template')}>
            <Icon name="star" />{e('saveAsTemplate')}
          </Button>
          {editable && (
            <Button variant="danger" className={BLOCK} onClick={() => setDialog('cancel')}>{e('cancel')}</Button>
          )}
        </section>
      )}

      <Picker open={picker !== null} replacing={picker?.replace ? nameOf(picker.replace) : null} exclude={items.map((i) => i.garmentId)} catalog={catalog}
        onClose={() => setPicker(null)} onPick={(g) => (picker?.replace ? replace(picker.replace, g.id) : addGarment(g))} onUnauthorized={toLogin} />

      {record && (
        <WashPanel open={dialog === 'wash'} record={record} lines={washLines} onClose={() => setDialog(null)} onUnauthorized={toLogin}
          onDone={(r) => void load([...r.marked, ...r.skipped.map((s) => s.garmentId)], true)} />
      )}

      <Dialog open={dialog === 'cancel'} onOpenChange={(o) => !o && setDialog(null)} title={e('cancelTitle')} description={e('cancelText')} closeLabel={c('close')}>
        <div className="flex flex-col gap-2">
          <Button variant="danger" className={BLOCK} aria-disabled={busy || undefined}
            onClick={() => act(async () => { await api(`/outfits/${outfit!.id}`, { method: 'DELETE', ifMatch: ifMatch() }); await refetch(); }, { tone: 'success', title: e('cancelledTitle') })}>
            {e('cancel')}
          </Button>
          <Button variant="outline" className={BLOCK} onClick={() => setDialog(null)}>{e('keep')}</Button>
        </div>
      </Dialog>

      <TextDialog open={dialog === 'template'} title={e('templateTitle')} label={e('templateName')} initial={outfit?.title ?? outfit?.occasion ?? ''} max={80} submit={e('saveAsTemplate')} busy={busy}
        onClose={() => setDialog(null)}
        onSubmit={(name) => act(() => api(`/outfits/${outfit!.id}/save-as-template`, { method: 'POST', idempotent: true, body: { name } }), { tone: 'success', title: e('templateSaved'), templates: true })} />

      <TextDialog open={dialog === 'invalidate'} title={e('invalidateTitle')} description={e('invalidateText')} label={e('reason')} initial="" max={500} multiline submit={e('invalidate')} busy={busy}
        onClose={() => setDialog(null)}
        onSubmit={(reason) => act(async () => {
          await api(`/wear-records/${record!.id}/invalidate`, { method: 'POST', body: { reason }, ifMatch: etagOf(record!.version) });
          setRecord(null);
          await refetch();
        }, { tone: 'success', title: e('invalidatedTitle') })} />
    </div>
  );
}

/** Wardrobe picker: search + category chips over /garments; unavailable garments can be picked, with a visible warning. */
function Picker({ open, replacing, exclude, catalog, onClose, onPick, onUnauthorized }: {
  open: boolean; replacing: string | null; exclude: string[]; catalog: Catalog; onClose: () => void; onPick: (g: Garment) => void; onUnauthorized: () => void;
}) {
  const p = useTranslations('outfits.picker');
  const w = useTranslations('wardrobe');
  const c = useTranslations('common');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [list, setList] = useState<Garment[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const id = setTimeout(() => {
      const query = new URLSearchParams({ limit: '48', ...(q.trim() ? { q: q.trim() } : {}), ...(category ? { category } : {}) });
      api<Page<Garment>>(`/garments?${query}`)
        .then(({ data }) => { if (live) { setList(data.items); setError(false); } })
        .catch((err) => { if (err instanceof ApiError && err.status === 401) onUnauthorized(); else if (live) setError(true); });
    }, 250);
    return () => { live = false; clearTimeout(id); };
  }, [open, q, category, onUnauthorized]);

  const shown = (list ?? []).filter((g) => !exclude.includes(g.id));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={replacing ? p('replaceTitle', { name: replacing }) : p('title')} closeLabel={c('close')}>
      <div className="flex flex-col gap-1">
        <label htmlFor="picker-search" className="text-sm font-bold">{w('filters.search')}</label>
        <input id="picker-search" type="search" className={SELECT} value={q} maxLength={100} onChange={(ev) => setQ(ev.target.value)} />
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={w('filters.category')}>
        <button type="button" className={CHIP} aria-pressed={!category} onClick={() => setCategory('')}>{w('filters.all')}</button>
        {catalog.categories.map((cat) => (
          <button key={cat.code} type="button" className={CHIP} aria-pressed={category === cat.code} onClick={() => setCategory(cat.code)}>{cat.label}</button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-danger">{p('loadError')}</p>
      ) : list === null ? (
        <p role="status" className="text-sm text-muted">{c('loading')}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted">{p('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="picker">
          {shown.map((g) => (
            <li key={g.id}>
              <button type="button" onClick={() => onPick(g)} className="flex min-h-12 w-full flex-col items-start gap-1 rounded-card border-[1.5px] border-border bg-surface p-3 text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <span className="flex w-full flex-wrap items-center justify-between gap-2">
                  <bdi className="font-bold">{garmentName(g, catalog)}</bdi>
                  <StatusPill status={g.status} />
                </span>
                {g.status !== 'AVAILABLE' && <span className="flex items-center gap-1 text-xs font-semibold text-warning"><Icon name="warn" />{p('unavailable')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** One required text (template name, invalidation reason) in a dialog. */
function TextDialog({ open, title, description, label, initial, max, multiline, submit, busy, onClose, onSubmit }: {
  open: boolean; title: string; description?: string; label: string; initial: string; max: number; multiline?: boolean; submit: string; busy: boolean; onClose: () => void; onSubmit: (v: string) => void;
}) {
  const c = useTranslations('common');
  const id = useId();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setValue(initial); setError(false); }
  }
  const go = () => (value.trim() ? onSubmit(value.trim()) : setError(true));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={title} description={description} closeLabel={c('close')}>
      <form className="flex flex-col gap-3" onSubmit={(ev) => { ev.preventDefault(); go(); }} noValidate>
        {multiline ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={id} className="text-sm font-bold">{label}</label>
            <textarea id={id} rows={3} maxLength={max} value={value} onChange={(ev) => setValue(ev.target.value)} aria-invalid={error || undefined} aria-describedby={error ? `${id}-e` : undefined}
              className="rounded-card border-[1.5px] border-border bg-surface p-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
            {error && <p id={`${id}-e`} role="alert" className="text-sm font-bold text-danger">{c('required')}</p>}
          </div>
        ) : (
          <TextField id={id} label={label} maxLength={max} value={value} onChange={(ev) => setValue(ev.target.value)} error={error ? c('required') : undefined} />
        )}
        <Button type="submit" variant="primary" className={BLOCK} aria-disabled={busy || undefined}>{submit}</Button>
        <Button variant="outline" className={BLOCK} onClick={onClose}>{c('cancel')}</Button>
      </form>
    </Dialog>
  );
}
