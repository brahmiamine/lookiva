'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LOCALES, type Locale } from '@/i18n/config';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Dialog } from '@/ui/components/Dialog';
import { Icon } from '@/ui/components/Icon';
import { Notice } from '@/ui/components/Notice';
import { PasswordField } from '@/ui/components/PasswordField';
import { TextField } from '@/ui/components/TextField';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import type { PreferencesView } from '../../server-api';
import { CARD, FIELD, H1, LINK, OPTION, SECTION } from '../../styles';

const NATIVE: Record<Locale, string> = { fr: 'Français', en: 'English', ar: 'العربية' };
const THERMAL = ['COLD', 'NEUTRAL', 'WARM'] as const;
const SELECT =
  'min-h-13 rounded-card border-[1.5px] border-border bg-surface px-3.5 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

type Form = Pick<PreferencesView, 'locale' | 'aiEnabled' | 'learningEnabled' | 'thermalSensitivity'> & { cityName: string; timezone: string };
const formOf = (p: PreferencesView): Form => ({
  locale: p.locale,
  cityName: p.cityName ?? '',
  timezone: p.timezone ?? 'UTC',
  aiEnabled: p.aiEnabled,
  learningEnabled: p.learningEnabled,
  thermalSensitivity: p.thermalSensitivity,
});

function Toggle({ id, title, text, checked, onChange, on, off }: { id: string; title: string; text: string; checked: boolean; onChange: (v: boolean) => void; on: string; off: string }) {
  return (
    <div className={`${CARD} mb-2.5 flex items-start gap-3 p-3.5`}>
      <div className="flex-1">
        <h3 id={`${id}-t`} className="text-base font-bold">
          {title}
        </h3>
        <p id={`${id}-d`} className="mt-1 text-[13px] text-muted">
          {text}
        </p>
      </div>
      <label className="flex min-h-11 min-w-11 flex-none flex-col items-center gap-0.5">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-labelledby={`${id}-t`}
          aria-describedby={`${id}-d`}
          className="relative h-7 w-12 cursor-pointer appearance-none rounded-full border-2 border-border bg-neutral-soft transition-colors after:absolute after:top-0.5 after:start-0.5 after:size-5 after:rounded-full after:bg-muted after:transition-[inset-inline-start] after:content-[''] checked:border-primary checked:bg-primary checked:after:start-[22px] checked:after:bg-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:after:transition-none"
        />
        <span className="text-xs font-extrabold" aria-hidden="true">
          {checked ? on : off}
        </span>
      </label>
    </div>
  );
}

export function Profile({ initial, etag: initialEtag, timeZones, pendingExportAt }: { initial: PreferencesView; etag: string; timeZones: string[]; pendingExportAt: string | null }) {
  const t = useTranslations('settings.profile');
  const c = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const ids = useId();
  const [saved, setSaved] = useState(formOf(initial));
  const [form, setForm] = useState(formOf(initial));
  const [etag, setEtag] = useState(initialEtag);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<(NoticeData & { conflict?: boolean }) | null>(null);
  const [exportAt, setExportAt] = useState(pendingExportAt);
  const [exportNotice, setExportNotice] = useState<NoticeData | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string>();
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState<NoticeData | null>(null);
  const [cityError, setCityError] = useState<string>();
  const cityRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const deletedRef = useRef<HTMLHeadingElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const deleteNoticeRef = useRef<HTMLDivElement>(null);
  useFocusOn(deleteNoticeRef, deleteNotice);
  useFocusOn(noticeRef, notice);
  useFocusOn(deletedRef, deleted);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fmt = (iso: string | Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { ...opts, timeZone: form.timezone }).format(new Date(iso));
  const unauthorized = (e: unknown) => e instanceof ApiError && e.status === 401 && (router.replace(`/${locale}/login`), true);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    // A city can be changed, never removed (the API requires a non-empty name): flag it instead of sending a patch.
    if (!form.cityName.trim()) {
      setCityError(c('required'));
      cityRef.current?.focus();
      return;
    }
    setCityError(undefined);
    // Only what changed; a hand-edited city drops the coordinates and country that came with the previous one.
    const patch: Record<string, unknown> = {};
    for (const k of Object.keys(form) as (keyof Form)[]) if (form[k] !== saved[k]) patch[k] = form[k];
    if ('cityName' in patch) Object.assign(patch, { countryCode: null, latitude: null, longitude: null });
    if (!Object.keys(patch).length) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await api<PreferencesView>('/me/preferences', { method: 'PATCH', body: patch, ifMatch: etag });
      setEtag(r.headers.get('ETag') ?? etag);
      setSaved(formOf(r.data));
      setForm(formOf(r.data));
      setSavedAt(new Date());
      if (r.data.locale !== locale) return router.replace(`/${r.data.locale}/settings/profile`);
    } catch (err) {
      if (unauthorized(err)) return;
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT')
        setNotice({ tone: 'warning', title: t('conflictTitle'), text: t('conflictText'), conflict: true });
      else setNotice(genericNotice(err));
    }
    setBusy(false);
  }

  async function requestExport() {
    try {
      const r = await api<{ requestedAt: string }>('/me/export-requests', { method: 'POST' });
      setExportAt(r.data.requestedAt);
      setExportNotice({ tone: 'success', title: t('exportDone') });
    } catch (err) {
      if (unauthorized(err)) return;
      setExportNotice(err instanceof ApiError && err.status === 429 ? { tone: 'warning', title: t('exportLimited') } : genericNotice(err));
    }
  }

  async function requestDeletion(e: FormEvent) {
    e.preventDefault();
    if (deleteBusy) return;
    if (!password) {
      setPasswordError(c('required'));
      passwordRef.current?.focus();
      return;
    }
    setDeleteBusy(true);
    setPasswordError(undefined);
    setDeleteNotice(null);
    try {
      await api('/me/deletion-request', { method: 'POST', body: { password } });
      setPassword('');
      setDeleting(false);
      setDeleted(true);
    } catch (err) {
      setPassword('');
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        setPasswordError(t('wrongPassword'));
        passwordRef.current?.focus();
      } else if (!unauthorized(err)) setDeleteNotice(genericNotice(err)); // 429, 503, network: not the password's fault
    }
    setDeleteBusy(false);
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined); // signed out either way
    router.replace(`/${locale}/login`);
  }

  if (deleted)
    return (
      <div className="mt-4 flex flex-col gap-4">
        <h1 ref={deletedRef} tabIndex={-1} className={H1}>
          {t('deletedTitle')}
        </h1>
        <Notice tone="success" title={t('deletedTitle')} text={t('deletedText')} />
        <Link className={LINK} href={`/${locale}/login`}>
          {t('toLogin')}
        </Link>
      </div>
    );

  const fieldset = (legend: string, hint: string, children: ReactNode) => (
    <fieldset className="mb-3.5 min-w-0">
      <legend className="mb-1.5 text-sm font-bold">{legend}</legend>
      <p className="mb-2 text-sm text-muted">{hint}</p>
      {children}
    </fieldset>
  );

  return (
    <>
      <h1 className={`${H1} mt-2`}>{t('title')}</h1>
      {notice && (
        <div className="mb-3.5">
          <Notice ref={noticeRef} role="alert" {...notice}>
            {notice.conflict && (
              <Button variant="outline" className="mt-2 self-start text-sm" onClick={() => window.location.reload()}>
                {t('reload')}
              </Button>
            )}
          </Notice>
        </div>
      )}
      <form noValidate onSubmit={save} className="flex flex-col">
        <div className="flex flex-col gap-3.5">
          <div className={FIELD}>
            <label htmlFor={`${ids}-lg`} className="text-sm font-bold">
              {t('language')}
            </label>
            <select id={`${ids}-lg`} value={form.locale} onChange={(e) => set('locale', e.target.value as Locale)} className={SELECT}>
              {LOCALES.map((l) => (
                <option key={l} value={l} lang={l}>
                  {NATIVE[l]}
                </option>
              ))}
            </select>
          </div>
          <TextField ref={cityRef} label={t('city')} autoComplete="address-level2" required value={form.cityName} onChange={(e) => set('cityName', e.target.value)} error={cityError} />
          <div className={FIELD}>
            <label htmlFor={`${ids}-tz`} className="text-sm font-bold">
              {t('timezone')}
            </label>
            <select id={`${ids}-tz`} dir="ltr" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} aria-describedby={`${ids}-tzh`} className={SELECT}>
              {(timeZones.includes(form.timezone) ? timeZones : [form.timezone, ...timeZones]).map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <p id={`${ids}-tzh`} className="text-sm text-muted">
              {t('timezoneHint')}
            </p>
          </div>
        </div>

        <h2 className={SECTION}>{t('privacy')}</h2>
        <Toggle id={`${ids}-ai`} title={t('aiTitle')} text={t('aiText')} checked={form.aiEnabled} onChange={(v) => set('aiEnabled', v)} on={t('on')} off={t('off')} />
        <Toggle id={`${ids}-ap`} title={t('learningTitle')} text={t('learningText')} checked={form.learningEnabled} onChange={(v) => set('learningEnabled', v)} on={t('on')} off={t('off')} />

        <h2 className={SECTION}>{t('comfort')}</h2>
        {fieldset(
          t('thermal'),
          t('thermalHint'),
          THERMAL.map((v) => (
            <div key={v} className={OPTION}>
              <input type="radio" name="thermal" id={`${ids}-th-${v}`} checked={form.thermalSensitivity === v} onChange={() => set('thermalSensitivity', v)} className="size-[22px] flex-none accent-primary" />
              <label htmlFor={`${ids}-th-${v}`} className="flex min-h-12 flex-1 cursor-pointer items-center">
                {t(v)}
              </label>
            </div>
          )),
        )}
        <Button variant="primary" type="submit" className={BLOCK} aria-disabled={busy || undefined}>
          {busy ? t('saving') : t('save')}
        </Button>
        <p role="status" className={`mt-2.5 flex items-center justify-center gap-1.5 text-[13px] font-bold ${dirty ? 'text-warning' : 'text-success'}`}>
          {dirty ? (
            <>
              <Icon name="warn" />
              {t('dirty')}
            </>
          ) : savedAt ? (
            <>
              <Icon name="check" />
              {t('savedAt', { time: fmt(savedAt, { timeStyle: 'short' }) })}
            </>
          ) : null}
        </p>
      </form>

      <h2 className={SECTION}>{t('account')}</h2>
      <div className="flex flex-col gap-3">
        <Link href={`/${locale}/settings/sessions`} className={`${BLOCK} inline-flex items-center justify-center gap-2 rounded-card border-[1.5px] border-primary bg-surface text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}>
          <Icon name="laptop" />
          {t('sessions')}
        </Link>
        <Button variant="outline" className={BLOCK} onClick={logout}>
          <Icon name="logout" directional />
          {t('logout')}
        </Button>
        <div className={`${CARD} flex flex-col gap-2 p-3.5`}>
          <Button variant="outline" className={BLOCK} onClick={requestExport} aria-describedby={`${ids}-ex`}>
            <Icon name="download" />
            {t('export')}
          </Button>
          <p id={`${ids}-ex`} className="text-[13px] text-muted">
            {t('exportText')} {exportAt && t('exportPending', { date: fmt(exportAt, { dateStyle: 'medium' }) })}
          </p>
          {exportNotice && <Notice {...exportNotice} />}
        </div>
        <div className={`${CARD} flex flex-col gap-2 p-3.5`}>
          <Button variant="danger" className={BLOCK} onClick={() => (setPasswordError(undefined), setDeleteNotice(null), setDeleting(true))} aria-describedby={`${ids}-del`}>
            <Icon name="trash" />
            {t('delete')}
          </Button>
          <p id={`${ids}-del`} className="text-[13px] text-muted">
            {t('deleteText')}
          </p>
        </div>
      </div>

      <Dialog open={deleting} onOpenChange={setDeleting} title={t('deleteTitle')} closeLabel={c('close')} description={t('deleteConfirmText')}>
        <form noValidate onSubmit={requestDeletion} className="flex flex-col gap-3">
          {deleteNotice && <Notice ref={deleteNoticeRef} role="alert" {...deleteNotice} />}
          <PasswordField
            ref={passwordRef}
            label={c('password')}
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError}
            showLabel={c('showPassword')}
            hideLabel={c('hidePassword')}
          />
          <Button variant="outline" className={BLOCK} onClick={() => setDeleting(false)}>
            {c('cancel')}
          </Button>
          <Button variant="danger" type="submit" className={BLOCK} aria-disabled={deleteBusy || undefined}>
            <Icon name="trash" />
            {t('deleteConfirm')}
          </Button>
        </form>
      </Dialog>
    </>
  );
}
