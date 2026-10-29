'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { Button } from '@/ui/components/Button';
import { GarmentCard } from '@/ui/components/GarmentCard';
import { GarmentStatusBadge } from '@/ui/components/GarmentStatusBadge';
import { Gallery } from '@/ui/components/Gallery';
import { Notice } from '@/ui/components/Notice';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';

export type GalleryItem = { id: string; name: string; version: number; status: string; statusLabel: string };
export type GalleryStatus = { code: string; label: string };

type BulkBody = { action: 'SET_STATUS'; ids: string[]; expectedVersions: Record<string, number>; params: { status: string } } | { action: 'DELETE'; ids: string[]; expectedVersions: Record<string, number> };

const SELECT = 'min-h-12 rounded-card border-[1.5px] border-border bg-surface px-3 text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** Gallery cards with multi-select. Each selected row sends its version, so a row changed elsewhere is refused (409), never overwritten. */
export function GalleryList({ items, statuses }: { items: GalleryItem[]; statuses: GalleryStatus[] }) {
  const t = useTranslations('wardrobe');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState(statuses[0]?.code ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  // One key per attempt: a network retry reuses it, a definitive answer rotates it.
  const idempotencyKey = useRef(crypto.randomUUID());
  useFocusOn(noticeRef, notice);

  const toggle = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  async function run(body: BulkBody, doneText: (n: number) => string) {
    if (busy) return;
    if (selected.size === 0) return setNotice({ tone: 'warning', title: t('bulk.noSelection') });
    setBusy(true);
    setNotice(null);
    try {
      const r = await api<{ affected: number }>('/garments/bulk-actions', { method: 'POST', body, idempotent: idempotencyKey.current });
      idempotencyKey.current = crypto.randomUUID();
      setSelected(new Set());
      setNotice({ tone: 'success', title: doneText(r.data.affected) });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return router.replace(`/${locale}/login`);
      if (!(err instanceof ApiError && err.code === 'NETWORK_ERROR')) idempotencyKey.current = crypto.randomUUID();
      setNotice(err instanceof ApiError && err.code === 'VERSION_CONFLICT' ? { tone: 'warning', title: t('errors.conflict') } : genericNotice(err));
    }
    setBusy(false);
  }

  // Only the selected rows are sent, each with the version the page showed: unselected garments are never touched.
  const picked = items.filter((g) => selected.has(g.id));
  const ids = picked.map((g) => g.id);
  const expectedVersions = Object.fromEntries(picked.map((g) => [g.id, g.version]));

  return (
    <>
      {notice && <Notice ref={noticeRef} {...notice} />}

      {selected.size > 0 && (
        <div role="region" aria-label={t('bulk.selected', { count: selected.size })} className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-sm">
          <span className="text-sm font-bold">{t('bulk.selected', { count: selected.size })}</span>
          <label className="sr-only" htmlFor="bulk-status">
            {t('bulk.status')}
          </label>
          <select id="bulk-status" className={SELECT} value={target} onChange={(e) => setTarget(e.target.value)}>
            {statuses.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
          <Button variant="primary" className="min-h-12" onClick={() => run({ action: 'SET_STATUS', ids, expectedVersions, params: { status: target } }, (n) => t('bulk.applied', { count: n }))} aria-disabled={busy || undefined}>
            {t('bulk.apply')}
          </Button>
          <Button variant="danger" className="min-h-12" onClick={() => run({ action: 'DELETE', ids, expectedVersions }, (n) => t('bulk.deleted', { count: n }))} aria-disabled={busy || undefined}>
            {t('bulk.delete')}
          </Button>
        </div>
      )}

      <Gallery>
        {items.map((g) => {
          const checked = selected.has(g.id);
          return (
            <div key={g.id} className="relative flex w-full">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(g.id)}
                aria-label={t('bulk.select', { name: g.name })}
                className="absolute start-2 top-2 z-10 size-6 accent-primary"
              />
              <Link href={`/${locale}/wardrobe/${g.id}`} className="flex w-full rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" data-selected={checked || undefined}>
                <GarmentCard name={g.name} badge={<GarmentStatusBadge status={g.status} label={g.statusLabel} />} />
              </Link>
            </div>
          );
        })}
      </Gallery>
    </>
  );
}
