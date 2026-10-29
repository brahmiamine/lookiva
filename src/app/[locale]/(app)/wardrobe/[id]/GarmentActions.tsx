'use client';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Dialog } from '@/ui/components/Dialog';
import { Icon } from '@/ui/components/Icon';
import { Notice } from '@/ui/components/Notice';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import { labelOf, type Catalog, type Garment } from '@/ui/wardrobe';

const SELECT = 'min-h-13 rounded-card border-[1.5px] border-border bg-surface px-3.5 text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** Status change (If-Match on the version we rendered) and move-to-trash. Both refresh or leave the page, so no local copy of the garment is kept. */
export function GarmentActions({ garment, etag, statuses }: { garment: Garment; etag: string; statuses: Catalog['statuses'] }) {
  const t = useTranslations('wardrobe.detail');
  const errors = useTranslations('wardrobe.errors');
  const c = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const [status, setStatus] = useState(garment.status);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useFocusOn(noticeRef, notice);

  const unauthorized = (e: unknown) => e instanceof ApiError && e.status === 401 && (router.replace(`/${locale}/login`), true);

  async function changeStatus() {
    if (busy || status === garment.status) return;
    setBusy(true);
    setNotice(null);
    try {
      await api(`/garments/${garment.id}/status`, { method: 'POST', body: { status }, ifMatch: etag });
      setNotice({ tone: 'success', title: t('statusSaved') });
      router.refresh(); // the server re-reads the garment and its new ETag
    } catch (err) {
      if (unauthorized(err)) return;
      setNotice(err instanceof ApiError && err.code === 'VERSION_CONFLICT' ? { tone: 'warning', title: errors('conflict') } : genericNotice(err));
    }
    setBusy(false);
  }

  async function trash() {
    setBusy(true);
    try {
      await api(`/garments/${garment.id}`, { method: 'DELETE' });
      router.replace(`/${locale}/wardrobe`);
    } catch (err) {
      if (unauthorized(err)) return;
      setConfirm(false);
      setNotice(genericNotice(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {notice && <Notice ref={noticeRef} {...notice} />}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm font-bold">
          {t('status')}
          <select className={SELECT} value={status} onChange={(e) => setStatus(e.target.value as Garment['status'])}>
            {statuses.map((s) => (
              <option key={s.code} value={s.code}>
                {labelOf(s.labels, locale)}
              </option>
            ))}
          </select>
        </label>
        <Button variant="primary" className="min-h-13 sm:w-auto" onClick={changeStatus} aria-disabled={busy || status === garment.status || undefined}>
          {t('changeStatus')}
        </Button>
      </div>

      <Button variant="danger" className={BLOCK} onClick={() => setConfirm(true)}>
        <Icon name="trash" />
        {t('trash')}
      </Button>

      <Dialog open={confirm} onOpenChange={setConfirm} title={t('trashTitle')} closeLabel={c('close')} description={t('trashText')}>
        <div className="flex flex-col gap-2">
          <Button variant="outline" className={BLOCK} onClick={() => setConfirm(false)}>
            {c('cancel')}
          </Button>
          <Button variant="danger" className={BLOCK} onClick={trash} aria-disabled={busy || undefined}>
            <Icon name="trash" />
            {t('trash')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
