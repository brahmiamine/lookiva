'use client';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type ChangeEvent } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { Button } from '@/ui/components/Button';
import { Icon } from '@/ui/components/Icon';
import { Notice } from '@/ui/components/Notice';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import type { Photo } from '@/ui/wardrobe';
import { CARD } from '../../styles';

/** Photos of one garment. The image bytes come from the owner-only file route (no-store, never a public URL). */
export function Photos({ garmentId, initial }: { garmentId: string; initial: Photo[] }) {
  const t = useTranslations('wardrobe.detail');
  const errors = useTranslations('wardrobe.errors');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useFocusOn(noticeRef, notice);

  const base = `/garments/${garmentId}/photos`;
  const fileUrl = (id: string) => `/api/v1${base}/${id}/file?variant=thumb`;

  // Each action re-reads the page from the server, so the list and the primary flag never drift from the database.
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return router.replace(`/${locale}/login`);
      if (err instanceof ApiError && err.status === 409 && err.code === 'PHOTO_LIMIT_REACHED') setNotice({ tone: 'warning', title: errors('photoLimit') });
      else if (err instanceof ApiError && err.status === 413) setNotice({ tone: 'warning', title: errors('photoTooLarge') });
      else if (err instanceof ApiError && err.status === 415) setNotice({ tone: 'warning', title: errors('photoUnsupported') });
      else setNotice(genericNotice(err));
    }
    setBusy(false);
  }

  function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // same file can be picked again after an error
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    void run(() => api(base, { method: 'POST', body }));
  }

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t('photosHint')}</p>
      {notice && <Notice ref={noticeRef} {...notice} />}

      <div>
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id={`photo-input-${garmentId}`} onChange={upload} disabled={busy} />
        <label htmlFor={`photo-input-${garmentId}`} aria-disabled={busy || undefined} className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-card border-[1.5px] border-primary bg-surface px-4 font-bold text-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary aria-disabled:cursor-not-allowed">
          <Icon name="download" />
          {busy ? t('uploading') : t('addPhoto')}
        </label>
      </div>

      {initial.length === 0 ? (
        <p className="text-sm text-muted">{t('noPhotos')}</p>
      ) : (
        <ul role="list" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {initial.map((p, i) => (
            <li key={p.id} className={`${CARD} flex flex-col overflow-hidden`}>
              <div className="relative aspect-[4/5] bg-neutral-soft">
                <Image src={fileUrl(p.id)} alt={t('photoN', { n: i + 1 })} fill unoptimized sizes="(min-width: 640px) 33vw, 50vw" className="object-cover" />
              </div>
              <div className="flex flex-col items-start gap-2 p-2.5">
                {p.isPrimary ? (
                  <span className="text-sm font-bold text-success">{t('primary')}</span>
                ) : (
                  <Button variant="outline" className="min-h-11 w-full text-sm" onClick={() => run(() => api(`${base}/${p.id}/primary`, { method: 'PUT' }))} aria-disabled={busy || undefined}>
                    {t('setPrimary')}
                  </Button>
                )}
                <Button variant="danger" className="min-h-11 w-full text-sm" onClick={() => run(() => api(`${base}/${p.id}`, { method: 'DELETE' }))} aria-disabled={busy || undefined}>
                  {t('deletePhoto')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
