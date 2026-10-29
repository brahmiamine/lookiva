'use client';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Notice } from '@/ui/components/Notice';
import { TextField } from '@/ui/components/TextField';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import { emptyGarmentForm, labelOf, toCreateBody, type Catalog, type Garment, type GarmentForm } from '@/ui/wardrobe';
import { FIELD } from '../../styles';

const SELECT = 'min-h-13 rounded-card border-[1.5px] border-border bg-surface px-3.5 text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const CHECK = 'flex min-h-11 items-center gap-2.5 rounded-card border-[1.5px] border-border bg-surface px-3 has-[:checked]:border-2 has-[:checked]:border-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary';

/** Creation form. Only the fields the user must or may fill; weather and purchase details are added on the garment page later. */
export function NewGarmentForm({ catalog }: { catalog: Catalog }) {
  const t = useTranslations('wardrobe.new');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const [form, setForm] = useState<GarmentForm>(emptyGarmentForm);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  // One key per submission: a network retry reuses it (no duplicate garment), a definitive answer rotates it.
  const idempotencyKey = useRef(crypto.randomUUID());
  useFocusOn(noticeRef, notice);

  const subtypes = catalog.categories.find((cat) => cat.code === form.categoryCode)?.subtypes ?? [];
  const set = <K extends keyof GarmentForm>(k: K, v: GarmentForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: 'seasons' | 'styles', code: string) =>
    set(k, form[k].includes(code) ? form[k].filter((x) => x !== code) : [...form[k], code]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await api<Garment>('/garments', { method: 'POST', body: toCreateBody(form), idempotent: idempotencyKey.current });
      router.push(`/${locale}/wardrobe/${r.data.id}`); // stays busy while the next page loads
      return;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return router.replace(`/${locale}/login`);
      if (!(err instanceof ApiError && err.code === 'NETWORK_ERROR')) idempotencyKey.current = crypto.randomUUID();
      setNotice(genericNotice(err));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3.5">
      {notice && <Notice ref={noticeRef} {...notice} />}

      <label className={FIELD}>
        <span className="text-sm font-bold">{t('category')}</span>
        <select required className={SELECT} value={form.categoryCode} onChange={(e) => setForm((f) => ({ ...f, categoryCode: e.target.value, subtypeCode: '' }))}>
          <option value="">{t('choose')}</option>
          {catalog.categories.map((cat) => (
            <option key={cat.code} value={cat.code}>
              {labelOf(cat.labels, locale)}
            </option>
          ))}
        </select>
      </label>

      <label className={FIELD}>
        <span className="text-sm font-bold">{t('subtype')}</span>
        <select required disabled={!form.categoryCode} className={SELECT} value={form.subtypeCode} onChange={(e) => set('subtypeCode', e.target.value)}>
          <option value="">{form.categoryCode ? t('choose') : t('pickCategoryFirst')}</option>
          {subtypes.map((s) => (
            <option key={s.code} value={s.code}>
              {labelOf(s.labels, locale)}
            </option>
          ))}
        </select>
      </label>

      <label className={FIELD}>
        <span className="text-sm font-bold">{t('color')}</span>
        <select required className={SELECT} value={form.colorCode} onChange={(e) => set('colorCode', e.target.value)}>
          <option value="">{t('choose')}</option>
          {catalog.colors.map((col) => (
            <option key={col.code} value={col.code}>
              {labelOf(col.labels, locale)}
            </option>
          ))}
        </select>
      </label>

      <TextField label={t('nickname')} maxLength={80} value={form.nickname} onChange={(e) => set('nickname', e.target.value)} autoComplete="off" />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">{t('seasons')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {catalog.seasons.map((s) => (
            <label key={s.code} className={CHECK}>
              <input type="checkbox" className="size-5 accent-primary" checked={form.seasons.includes(s.code)} onChange={() => toggle('seasons', s.code)} />
              {labelOf(s.labels, locale)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">{t('styles')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {catalog.styles.map((s) => (
            <label key={s.code} className={CHECK}>
              <input type="checkbox" className="size-5 accent-primary" checked={form.styles.includes(s.code)} onChange={() => toggle('styles', s.code)} />
              {labelOf(s.labels, locale)}
            </label>
          ))}
        </div>
      </fieldset>

      <label className={FIELD}>
        <span className="text-sm font-bold">{t('notes')}</span>
        <textarea maxLength={2000} rows={3} className={`${SELECT} min-h-24 py-2`} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>

      <Button type="submit" variant="primary" className={BLOCK} aria-disabled={busy || undefined}>
        {busy ? t('saving') : t('submit')}
      </Button>
    </form>
  );
}
