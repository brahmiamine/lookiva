'use client';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Notice } from '@/ui/components/Notice';
import { TextField } from '@/ui/components/TextField';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import { type Garment } from '@/ui/wardrobe';
import { FIELD } from '../../styles';

const SELECT = 'min-h-13 rounded-card border-[1.5px] border-border bg-surface px-3.5 text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const WEATHER = ['warmth', 'rain', 'windproof', 'breathability', 'layering'] as const;

type Editable = { nickname: string; notes: string; purchasePrice: string; purchaseCurrency: string; purchasedOn: string; purchaseStore: string } & Record<(typeof WEATHER)[number], string>;

const formOf = (g: Garment): Editable => ({
  nickname: g.nickname ?? '',
  notes: g.notes ?? '',
  purchasePrice: g.purchasePrice === null ? '' : String(g.purchasePrice),
  purchaseCurrency: g.purchaseCurrency ?? '',
  purchasedOn: g.purchasedOn ?? '',
  purchaseStore: g.purchaseStore ?? '',
  warmth: g.warmth,
  rain: g.rain,
  windproof: g.windproof,
  breathability: g.breathability,
  layering: g.layering,
});

/** Body in the API's shape: blank means null. Compared field by field below, so only what changed is sent. */
const bodyOf = (f: Editable) => ({
  nickname: f.nickname.trim() || null,
  notes: f.notes.trim() || null,
  purchasePrice: f.purchasePrice.trim() === '' ? null : Number(f.purchasePrice),
  purchaseCurrency: f.purchaseCurrency.trim().toUpperCase() || null,
  purchasedOn: f.purchasedOn || null,
  purchaseStore: f.purchaseStore.trim() || null,
  warmth: f.warmth,
  rain: f.rain,
  windproof: f.windproof,
  breathability: f.breathability,
  layering: f.layering,
});

/** Edits the details and the weather attributes. PATCH with If-Match: a garment changed elsewhere is refused (409). */
export function GarmentEditor({ garment, etag, weather, weatherLabels }: { garment: Garment; etag: string; weather: Record<string, string[]>; weatherLabels: { field: Record<string, string>; value: Record<string, Record<string, string>> } }) {
  const t = useTranslations('wardrobe');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const initial = formOf(garment);
  const [form, setForm] = useState<Editable>(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useFocusOn(noticeRef, notice);

  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const next = bodyOf(form);
    const prev = bodyOf(initial);
    const patch = Object.fromEntries(Object.entries(next).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(prev[k as keyof typeof prev])));
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      await api(`/garments/${garment.id}`, { method: 'PATCH', body: patch, ifMatch: etag });
      setNotice({ tone: 'success', title: t('edit.saved') });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return router.replace(`/${locale}/login`);
      setNotice(err instanceof ApiError && err.code === 'VERSION_CONFLICT' ? { tone: 'warning', title: t('errors.conflict') } : genericNotice(err));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3.5">
      {notice && <Notice ref={noticeRef} {...notice} />}

      <TextField label={t('edit.nickname')} maxLength={80} value={form.nickname} onChange={(e) => set('nickname', e.target.value)} />

      <label className={FIELD}>
        <span className="text-sm font-bold">{t('edit.notes')}</span>
        <textarea maxLength={2000} rows={3} className={`${SELECT} min-h-24 py-2`} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <TextField label={t('edit.price')} type="number" inputMode="decimal" min={0} step="0.01" value={form.purchasePrice} onChange={(e) => set('purchasePrice', e.target.value)} />
        <TextField label={t('edit.currency')} maxLength={3} value={form.purchaseCurrency} onChange={(e) => set('purchaseCurrency', e.target.value)} />
        <TextField label={t('edit.purchasedOn')} type="date" value={form.purchasedOn} onChange={(e) => set('purchasedOn', e.target.value)} />
        <TextField label={t('edit.store')} maxLength={120} value={form.purchaseStore} onChange={(e) => set('purchaseStore', e.target.value)} />
      </div>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-bold">{t('edit.weather')}</legend>
        {WEATHER.map((field) => (
          <label key={field} className={FIELD}>
            <span className="text-sm font-bold">{weatherLabels.field[field]}</span>
            <select className={SELECT} value={form[field]} onChange={(e) => set(field, e.target.value)}>
              {(weather[field] ?? []).map((code) => (
                <option key={code} value={code}>
                  {weatherLabels.value[field]?.[code] ?? code}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>

      <Button type="submit" variant="primary" className={BLOCK} aria-disabled={busy || undefined}>
        {t('edit.save')}
      </Button>
    </form>
  );
}
