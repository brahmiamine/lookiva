'use client';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Notice } from '@/ui/components/Notice';
import { TextField } from '@/ui/components/TextField';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import type { OutfitDetail } from '@/ui/wardrobe';

const INPUT = 'min-h-13 rounded-card border-[1.5px] border-border bg-surface px-3.5 text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/**
 * Confirm the wear, plan, or cancel one outfit. Dates are typed and sent in UTC. Each write carries the version the page
 * showed (If-Match), so an outfit changed elsewhere is refused. Confirming uses one Idempotency-Key per attempt.
 */
export function OutfitActions({ outfit, open }: { outfit: OutfitDetail; open: boolean }) {
  const t = useTranslations('wardrobe.outfits');
  const errors = useTranslations('wardrobe.errors');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const [name, setName] = useState(outfit.name ?? '');
  const [occasion, setOccasion] = useState(outfit.occasion ?? '');
  // datetime-local has no zone: it is read as UTC, matching the UTC week view.
  const [when, setWhen] = useState(outfit.plannedFor ? outfit.plannedFor.slice(0, 16) : '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const confirmKey = useRef(crypto.randomUUID());
  useFocusOn(noticeRef, notice);

  const etag = `W/"v${outfit.version}"`;

  async function run(action: () => Promise<unknown>, done?: string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await action();
      if (done) setNotice({ tone: 'success', title: done });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return router.replace(`/${locale}/login`);
      if (err instanceof ApiError && err.code === 'OUTFIT_ALREADY_WORN') setNotice({ tone: 'warning', title: t('alreadyWorn') });
      else if (err instanceof ApiError && err.code === 'GARMENT_UNAVAILABLE') setNotice({ tone: 'warning', title: t('trashed') });
      else if (err instanceof ApiError && err.code === 'PLANNED_NEEDS_START') setNotice({ tone: 'warning', title: t('startNeeded') });
      else if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') setNotice({ tone: 'warning', title: errors('conflict') });
      else if (err instanceof ApiError && err.code === 'OUTFIT_LOCKED') setNotice({ tone: 'warning', title: t('locked') });
      else setNotice(genericNotice(err));
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  const confirm = () =>
    run(async () => {
      await api(`/outfits/${outfit.id}/confirm-worn`, { method: 'POST', idempotent: confirmKey.current });
    }, t('confirmed'));

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(() => api(`/outfits/${outfit.id}`, { method: 'PATCH', ifMatch: etag, body: { name: name.trim() || null, occasion: occasion.trim() || null, plannedFor: when ? new Date(`${when}:00Z`).toISOString() : null } }), t('saved'));
  }

  const cancel = () => run(() => api(`/outfits/${outfit.id}`, { method: 'PATCH', ifMatch: etag, body: { status: 'CANCELLED' } }), t('cancelledNote'));

  return (
    <div className="flex flex-col gap-4">
      {notice && <Notice ref={noticeRef} {...notice} />}
      {!open && <p className="text-sm text-muted">{outfit.status === 'WORN' ? t('alreadyWorn') : t('locked')}</p>}

      {open && (
        <>
          <Button variant="primary" className={BLOCK} onClick={confirm} aria-disabled={busy || undefined}>
            {t('confirm')}
          </Button>

          <form onSubmit={save} className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{t('planTitle')}</h2>
            <TextField label={t('name')} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label={t('occasion')} maxLength={40} value={occasion} onChange={(e) => setOccasion(e.target.value)} />
            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold">{t('plannedFor')}</span>
              <input type="datetime-local" className={INPUT} value={when} onChange={(e) => setWhen(e.target.value)} />
            </label>
            <Button type="submit" variant="outline" className={BLOCK} aria-disabled={busy || undefined}>
              {t('save')}
            </Button>
          </form>

          <Button variant="danger" className={BLOCK} onClick={cancel} aria-disabled={busy || undefined}>
            {t('cancelOutfit')}
          </Button>
        </>
      )}
    </div>
  );
}
