'use client';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Notice } from '@/ui/components/Notice';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';

/**
 * Optional laundry step after a confirmed wear. Nothing is ticked by default: only the garments the user picks become TO_WASH,
 * and the wear record itself is never changed. A failure here does not undo the wear.
 */
export function WashPanel({ wearRecordId, items }: { wearRecordId: string; items: { garmentId: string; name: string }[] }) {
  const t = useTranslations('wardrobe.outfits.wash');
  const genericNotice = useErrorNotice();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const key = useRef(crypto.randomUUID());
  useFocusOn(noticeRef, notice);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function send() {
    if (busy) return;
    if (picked.length === 0) return setNotice({ tone: 'warning', title: t('nothing') });
    setBusy(true);
    setNotice(null);
    try {
      const r = await api<{ changedIds: string[] }>(`/wear-records/${wearRecordId}/mark-to-wash`, { method: 'POST', body: { garmentIds: picked }, idempotent: key.current });
      key.current = crypto.randomUUID();
      setPicked([]);
      setNotice({ tone: 'success', title: t('done', { count: String(r.data.changedIds.length) }) });
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'NETWORK_ERROR')) key.current = crypto.randomUUID();
      setNotice(genericNotice(err));
    }
    setBusy(false);
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">{t('title')}</h2>
      <p className="text-sm text-muted">{t('lead')}</p>
      {notice && <Notice ref={noticeRef} {...notice} />}
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">{t('title')}</legend>
        {items.map((i) => (
          <label key={i.garmentId} className="flex min-h-11 items-center gap-3 rounded-card border-[1.5px] border-border bg-surface px-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary">
            <input type="checkbox" className="size-5 accent-primary" checked={picked.includes(i.garmentId)} onChange={() => toggle(i.garmentId)} />
            <span>{i.name}</span>
          </label>
        ))}
      </fieldset>
      <Button variant="outline" className={BLOCK} onClick={send} aria-disabled={busy || undefined}>
        {t('submit')}
      </Button>
    </section>
  );
}
