'use client';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, api, retryMinutes } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Dialog } from '@/ui/components/Dialog';
import { Icon } from '@/ui/components/Icon';
import { Notice } from '@/ui/components/Notice';
import { TextField } from '@/ui/components/TextField';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import { emptyForm, formOf, limitKey, mapServerErrors, toBody, validateForm, type FormField, type GarmentForm as Form } from './logic';
import { WEATHER, etagOf, garmentName, type Catalog, type Custom, type Garment } from './types';
import { SELECT } from './ui';

export type FormMode = { kind: 'create' } | { kind: 'edit'; garment: Garment } | { kind: 'duplicate'; source: Garment };

const SECTION = 'mt-6 mb-2 text-[13px] font-extrabold tracking-wide text-muted uppercase';
const CHECK = 'flex min-h-11 items-center gap-2 rounded-card border-[1.5px] border-border bg-surface px-3 text-sm font-semibold has-[:checked]:border-primary has-[:checked]:bg-info-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary';

export function GarmentForm({ catalog, mode }: { catalog: Catalog; mode: FormMode }) {
  const t = useTranslations('wardrobe.form');
  const w = useTranslations('wardrobe');
  const c = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const ids = useId();
  const initial = mode.kind === 'create' ? emptyForm() : formOf(mode.kind === 'edit' ? mode.garment : mode.source);
  const [form, setForm] = useState<Form>(initial);
  const [customs, setCustoms] = useState<Custom[]>(catalog.customs);
  const [errors, setErrors] = useState<Partial<Record<FormField, string>>>({});
  const [notice, setNotice] = useState<(NoticeData & { conflict?: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [copyPhotos, setCopyPhotos] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const key = useRef('');
  const noticeRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusOn(noticeRef, notice);

  const set = <K extends FormField>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v, ...(k === 'categoryCode' ? { subtype: '' } : {}) }));
    key.current = ''; // the body changed: a new submit is a new intent
  };
  const toggleIn = (k: 'extraColors' | 'seasons' | 'styles', code: string) =>
    set(k, form[k].includes(code) ? form[k].filter((x) => x !== code) : [...form[k], code]);
  const category = catalog.categories.find((x) => x.code === form.categoryCode);
  const myCustoms = customs.filter((x) => x.categoryCode === form.categoryCode);
  const errText = (f: FormField) => (errors[f] ? t(`errors.${errors[f]}` as 'errors.required') : undefined);

  const focusFirstError = () =>
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

  function submit(e: FormEvent) {
    e.preventDefault();
    const local = validateForm(form);
    setErrors(local);
    if (Object.keys(local).length) {
      setNotice({ tone: 'danger', title: t('fixErrors') });
      return focusFirstError();
    }
    if (mode.kind === 'duplicate') return setConfirm(true);
    void send();
  }

  async function send() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    key.current ||= crypto.randomUUID();
    const body = toBody(form);
    try {
      let id: string;
      if (mode.kind === 'edit') {
        await api(`/garments/${mode.garment.id}`, { method: 'PATCH', body, ifMatch: etagOf(mode.garment.version) });
        id = mode.garment.id;
      } else if (mode.kind === 'duplicate') {
        id = (await api<Garment>(`/garments/${mode.source.id}/duplicate`, { method: 'POST', body: { ...body, copyPhotos }, idempotent: key.current })).data.id;
      } else {
        id = (await api<Garment>('/garments', { method: 'POST', body, idempotent: key.current })).data.id;
      }
      key.current = '';
      router.push(`/${locale}/dressing/${id}${mode.kind === 'edit' ? '?saved=1' : '?created=1'}`);
      return;
    } catch (err) {
      setConfirm(false);
      if (err instanceof ApiError && err.status === 401) return router.replace(`/${locale}/login`);
      const limit = err instanceof ApiError && err.status !== 429 ? limitKey(err.status, err.code) : null; // 429 here = write budget: generic notice
      if (limit && err instanceof ApiError) setNotice({ tone: 'warning', title: w(`limits.${limit}`, { minutes: retryMinutes(err) }) });
      else if (err instanceof ApiError && (err.code === 'VERSION_CONFLICT' || err.status === 412 || err.status === 428)) {
        setNotice({ tone: 'warning', title: t('conflictTitle'), text: t('conflictText'), conflict: true });
      } else if (err instanceof ApiError && err.status === 400 && err.errors.length) {
        const { fields, unmapped } = mapServerErrors(err.errors);
        setErrors(fields);
        setNotice({ tone: 'danger', title: t('fixErrors'), text: unmapped.length ? t('serverRefused') : undefined });
        focusFirstError();
      } else if (err instanceof ApiError && err.status === 404) {
        setNotice({ tone: 'danger', title: t('goneTitle'), text: t('goneText') });
      } else setNotice(genericNotice(err));
    }
    setBusy(false);
  }

  const title = mode.kind === 'edit' ? t('editTitle') : mode.kind === 'duplicate' ? t('duplicateTitle') : t('createTitle');

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-3.5 pb-6">
      <h1 className="mt-2 text-2xl font-extrabold">{title}</h1>
      {mode.kind === 'duplicate' && <p className="text-[15px] text-muted">{t('duplicateLead', { name: garmentName(mode.source, catalog) })}</p>}
      <p className="text-sm text-muted">{t('requiredHint')}</p>
      {notice && (
        <Notice ref={noticeRef} {...notice} role="alert">
          {notice.conflict && (
            <Button variant="outline" className="mt-2 self-start text-sm" onClick={() => window.location.reload()}>
              {t('reload')}
            </Button>
          )}
        </Notice>
      )}

      <TextField label={t('nickname')} hint={t('nicknameHint')} value={form.nickname} maxLength={80} onChange={(e) => set('nickname', e.target.value)} error={errText('nickname')} />

      <h2 className={SECTION}>{t('classification')}</h2>
      <Select id={`${ids}-cat`} label={`${t('category')} *`} value={form.categoryCode} onChange={(v) => set('categoryCode', v)} error={errText('categoryCode')} required>
        <option value="">{t('choose')}</option>
        {catalog.categories.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
      </Select>
      <Select id={`${ids}-sub`} label={`${t('subtype')} *`} value={form.subtype} onChange={(v) => set('subtype', v)} error={errText('subtype')} required disabled={!form.categoryCode} hint={!form.categoryCode ? t('subtypeHint') : undefined}>
        <option value="">{t('choose')}</option>
        <optgroup label={t('standard')}>
          {category?.subtypes.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
        </optgroup>
        {myCustoms.length > 0 && (
          <optgroup label={t('mine')}>
            {myCustoms.map((x) => <option key={x.id} value={`custom:${x.id}`}>{x.label}</option>)}
          </optgroup>
        )}
      </Select>
      {category && (
        <CustomCreator
          category={category}
          onCreated={(cu) => {
            setCustoms((list) => [...list, cu]);
            set('subtype', `custom:${cu.id}`);
          }}
        />
      )}

      <h2 className={SECTION}>{t('colors')}</h2>
      <Select id={`${ids}-color`} label={`${t('primaryColor')} *`} value={form.primaryColor} onChange={(v) => set('primaryColor', v)} error={errText('primaryColor')} required>
        <option value="">{t('choose')}</option>
        {catalog.colors.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
      </Select>
      <Checks legend={t('extraColors')} hint={t('extraColorsHint')} error={errText('extraColors')}>
        {catalog.colors.filter((x) => x.code !== form.primaryColor).map((x) => (
          <label key={x.code} className={CHECK}>
            <input type="checkbox" className="size-5 accent-primary" checked={form.extraColors.includes(x.code)} onChange={() => toggleIn('extraColors', x.code)} />
            <span aria-hidden="true" className="size-4 rounded-full border border-border" style={{ background: x.hex }} />
            {x.label}
          </label>
        ))}
      </Checks>

      <h2 className={SECTION}>{t('usage')}</h2>
      <Checks legend={t('seasons')}>
        {catalog.seasons.map((x) => (
          <label key={x.code} className={CHECK}>
            <input type="checkbox" className="size-5 accent-primary" checked={form.seasons.includes(x.code)} onChange={() => toggleIn('seasons', x.code)} />
            {x.label}
          </label>
        ))}
      </Checks>
      <Checks legend={t('styles')}>
        {catalog.styles.map((x) => (
          <label key={x.code} className={CHECK}>
            <input type="checkbox" className="size-5 accent-primary" checked={form.styles.includes(x.code)} onChange={() => toggleIn('styles', x.code)} />
            {x.label}
          </label>
        ))}
      </Checks>

      <h2 className={SECTION}>{t('weather')}</h2>
      <p className="text-sm text-muted">{t('weatherHint')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {WEATHER.map((f) => (
          <Select key={f} id={`${ids}-${f}`} label={w(`weather.${f}.label`)} value={form[f]} onChange={(v) => set(f, v)} error={errText(f)}>
            {catalog.weather[f].map((v) => <option key={v} value={v}>{w(`weather.${f}.${v}` as 'weather.warmth.UNKNOWN')}</option>)}
          </Select>
        ))}
      </div>

      <h2 className={SECTION}>{t('purchase')}</h2>
      <p className="text-sm text-muted">{t('purchaseHint')}</p>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <TextField label={t('price')} inputMode="decimal" value={form.purchasePrice} onChange={(e) => set('purchasePrice', e.target.value)} error={errText('purchasePrice')} />
        <TextField label={t('currency')} value={form.purchaseCurrency} maxLength={3} size={5} autoCapitalize="characters" dir="ltr" onChange={(e) => set('purchaseCurrency', e.target.value.toUpperCase())} error={errText('purchaseCurrency')} hint="EUR" />
      </div>
      <TextField label={t('purchasedOn')} type="date" value={form.purchasedOn} onChange={(e) => set('purchasedOn', e.target.value)} error={errText('purchasedOn')} />
      <TextField label={t('store')} value={form.purchaseStore} maxLength={120} onChange={(e) => set('purchaseStore', e.target.value)} error={errText('purchaseStore')} />

      <h2 className={SECTION}>{t('notes')}</h2>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${ids}-notes`} className="text-sm font-bold">{t('notes')}</label>
        <textarea id={`${ids}-notes`} rows={4} maxLength={2000} value={form.notes} onChange={(e) => set('notes', e.target.value)} aria-invalid={errors.notes ? true : undefined} className="rounded-card border-[1.5px] border-border bg-surface p-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
      </div>

      {mode.kind === 'duplicate' && (
        <label className={CHECK}>
          <input type="checkbox" className="size-5 accent-primary" checked={copyPhotos} onChange={(e) => setCopyPhotos(e.target.checked)} />
          {t('copyPhotos')}
        </label>
      )}

      <Button type="submit" variant="primary" className={`${BLOCK} mt-4`} aria-disabled={busy || undefined}>
        {busy ? t('saving') : mode.kind === 'edit' ? t('save') : mode.kind === 'duplicate' ? t('duplicate') : t('create')}
      </Button>
      <Button variant="secondary" className={BLOCK} onClick={() => router.back()}>
        {c('cancel')}
      </Button>

      {mode.kind === 'duplicate' && (
        <Dialog open={confirm} onOpenChange={setConfirm} title={t('confirmDuplicateTitle')} closeLabel={c('close')} description={copyPhotos ? t('confirmDuplicateWithPhotos') : t('confirmDuplicateNoPhotos')}>
          <div className="flex flex-col gap-2">
            <Button variant="primary" className={BLOCK} onClick={send} aria-disabled={busy || undefined}>
              <Icon name="copy" />
              {t('duplicate')}
            </Button>
            <Button variant="outline" className={BLOCK} onClick={() => setConfirm(false)}>{c('cancel')}</Button>
          </div>
        </Dialog>
      )}
    </form>
  );
}

function Select({ id, label, value, onChange, error, hint, required, disabled, children }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; required?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold">{label}</label>
      <select
        id={id}
        className={`${SELECT} ${error ? 'border-danger' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined}
        disabled={disabled}
      >
        {children}
      </select>
      {hint && <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p>}
      {error && <FieldError id={`${id}-error`} text={error} />}
    </div>
  );
}

const FieldError = ({ id, text }: { id: string; text: string }) => (
  <p id={id} role="alert" className="flex items-start gap-1.5 text-sm font-bold text-danger">
    <Icon name="warn" className="mt-0.5" />
    <span>{text}</span>
  </p>
);

function Checks({ legend, hint, error, children }: { legend: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-bold">{legend}</legend>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      <div className="flex flex-wrap gap-2">{children}</div>
      {error && <FieldError id={`${legend}-error`} text={error} />}
    </fieldset>
  );
}

/** Inline creation of a custom subcategory, attached to a standard subtype of the chosen category. */
function CustomCreator({ category, onCreated }: { category: Catalog['categories'][number]; onCreated: (c: Custom) => void }) {
  const t = useTranslations('wardrobe.form');
  const genericNotice = useErrorNotice();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function create() {
    if (busy) return;
    if (!name.trim() || !parent) return setError(t('errors.required'));
    setBusy(true);
    setError(undefined);
    try {
      const { data } = await api<Custom>('/custom-subcategories', { method: 'POST', body: { label: name.trim(), parentSubtypeCode: parent } });
      onCreated({ id: data.id, label: data.label, parentSubtypeCode: data.parentSubtypeCode, categoryCode: data.categoryCode });
      setOpen(false);
      setName('');
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'CUSTOM_SUBCATEGORY_EXISTS' ? t('customExists') : genericNotice(e).title);
    }
    setBusy(false);
  }

  if (!open)
    return (
      <Button variant="secondary" className="self-start text-sm" onClick={() => setOpen(true)} aria-expanded={false}>
        <Icon name="plus" />
        {t('customCreate')}
      </Button>
    );
  return (
    <div className="flex flex-col gap-3 rounded-card border border-neutral-soft bg-surface p-3" role="group" aria-labelledby={`${ids}-t`}>
      <p id={`${ids}-t`} className="font-bold">{t('customCreate')}</p>
      <TextField label={t('customName')} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      <Select id={`${ids}-parent`} label={t('customParent')} value={parent} onChange={setParent}>
        <option value="">{t('choose')}</option>
        {category.subtypes.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
      </Select>
      {error && <FieldError id={`${ids}-err`} text={error} />}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" className="text-sm" onClick={create} aria-disabled={busy || undefined}>{t('customAdd')}</Button>
        <Button variant="secondary" className="text-sm" onClick={() => setOpen(false)}>{t('customCancel')}</Button>
      </div>
    </div>
  );
}
