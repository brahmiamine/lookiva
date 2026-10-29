'use client';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { ApiError, api, retryMinutes } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Dialog } from '@/ui/components/Dialog';
import { Icon } from '@/ui/components/Icon';
import { Notice } from '@/ui/components/Notice';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import { MAX_PHOTOS, checkPhoto, limitKey, nextRotation, uploadProblem } from './logic';
import type { Photo } from './types';
import { PhotoImg, photoUrl } from './ui';

/** multipart upload with progress (fetch has no upload progress): resolves the new photo or rejects with an ApiError. */
export function uploadPhoto(garmentId: string, file: File, rotate: number, onProgress: (pct: number) => void): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/v1/garments/${garmentId}/photos`);
    xhr.setRequestHeader('X-Requested-With', 'lookiva');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR'));
    xhr.onload = () => {
      let body: { code?: string } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not json */
      }
      if (xhr.status === 201 && body) resolve(body as Photo);
      else {
        const retry = Number(xhr.getResponseHeader('Retry-After'));
        reject(new ApiError(xhr.status, typeof body?.code === 'string' ? body.code : 'HTTP_ERROR', [], Number.isFinite(retry) && retry > 0 ? retry : undefined));
      }
    };
    const fd = new FormData();
    fd.set('file', file);
    if (rotate) fd.set('rotate', String(rotate));
    xhr.send(fd);
  });
}

type Staged = { file: File; url: string; rotate: number };

export function PhotoManager({ garmentId, name, onUnauthorized }: { garmentId: string; name: string; onUnauthorized: () => void }) {
  const t = useTranslations('wardrobe.photos');
  const lim = useTranslations('wardrobe.limits');
  const c = useTranslations('common');
  const genericNotice = useErrorNotice();
  const ids = useId();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [current, setCurrent] = useState(0);
  const [showCutout, setShowCutout] = useState(false);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  useFocusOn(noticeRef, notice);

  /** Caps, quota and the upload budget get their own message; anything else the generic one. */
  const limitNotice = useCallback(
    (e: unknown): NoticeData | null => {
      const k = e instanceof ApiError ? limitKey(e.status, e.code) : null;
      return k && e instanceof ApiError ? { tone: 'warning', title: lim(k, { minutes: retryMinutes(e) }) } : null;
    },
    [lim],
  );
  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) return onUnauthorized();
      setNotice(limitNotice(e) ?? genericNotice(e));
    },
    [genericNotice, onUnauthorized, limitNotice],
  );

  const load = useCallback(async () => {
    try {
      const { data } = await api<{ items: Photo[] }>(`/garments/${garmentId}/photos`);
      setPhotos(data.items);
      return data.items;
    } catch (e) {
      fail(e);
      setPhotos([]);
      return [];
    }
  }, [garmentId, fail]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is only set after the await
    void load();
  }, [load]);
  const stagedUrl = staged?.url;
  useEffect(() => () => {
    if (stagedUrl) URL.revokeObjectURL(stagedUrl);
  }, [stagedUrl]);

  const list = photos ?? [];
  const photo = list[Math.min(current, list.length - 1)];
  const count = list.length;

  function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // the same file can be chosen again
    if (!file) return;
    const problem = checkPhoto(file, count);
    if (problem) return setNotice({ tone: 'danger', title: t(`errors.${problem}`) });
    setNotice(null);
    setStaged({ file, url: URL.createObjectURL(file), rotate: 0 });
  }

  async function upload() {
    if (!staged || progress !== null) return;
    setProgress(0);
    try {
      const p = await uploadPhoto(garmentId, staged.file, staged.rotate, setProgress);
      setStaged(null);
      const items = await load();
      setCurrent(Math.max(0, items.findIndex((x) => x.id === p.id)));
      setNotice({ tone: 'success', title: t('uploaded') });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onUnauthorized();
      else if (limitNotice(e)) setNotice(limitNotice(e));
      else if (e instanceof ApiError && e.status === 0) setNotice(genericNotice(e));
      else if (e instanceof ApiError) {
        const k = uploadProblem(e.status, e.code);
        setNotice(k === 'generic' ? genericNotice(e) : { tone: 'danger', title: t(`errors.${k}`) });
        if (k === 'limit') void load();
      }
    }
    setProgress(null);
  }

  async function act(fn: () => Promise<unknown>, done?: NoticeData) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (done) setNotice(done);
    } catch (e) {
      fail(e);
    }
    setBusy(false);
  }

  const setPrimary = () => photo && act(async () => {
    await api(`/garments/${garmentId}/photos/${photo.id}/primary`, { method: 'PUT' });
    await load();
  }, { tone: 'success', title: t('primaryDone') });

  const remove = () => photo && act(async () => {
    await api(`/garments/${garmentId}/photos/${photo.id}`, { method: 'DELETE' }).catch((e) => {
      if (!(e instanceof ApiError && e.status === 404)) throw e; // already gone: same outcome
    });
    setConfirmDelete(false);
    setCurrent(0);
    await load();
  }, { tone: 'success', title: t('deleted') });

  const cutout = () => photo && act(async () => {
    const { data } = await api<Photo>(`/garments/${garmentId}/photos/${photo.id}/cutout`, { method: 'POST' });
    setPhotos((ps) => ps?.map((x) => (x.id === data.id ? data : x)) ?? null);
    setShowCutout(data.cutoutStatus === 'READY');
    setNotice(data.cutoutStatus === 'READY' ? { tone: 'success', title: t('cutoutDone') } : { tone: 'warning', title: t('cutoutFailedTitle'), text: t('cutoutFailedText') });
  });

  const src = photo ? photoUrl(garmentId, photo.id, showCutout && photo.cutoutStatus === 'READY' ? 'cutout' : 'optimized') : null;

  return (
    <section aria-labelledby={`${ids}-h`} className="flex flex-col gap-3">
      <h2 id={`${ids}-h`} className="sr-only">{t('title')}</h2>
      <div className="relative aspect-[4/5] max-h-[60vh] overflow-hidden rounded-card border border-neutral-soft bg-surface sm:aspect-[5/4]">
        {photos === null ? (
          <div role="status" className="h-full w-full animate-pulse bg-neutral-soft motion-reduce:animate-none">
            <span className="sr-only">{c('loading')}</span>
          </div>
        ) : (
          <PhotoImg src={src} alt={photo ? t('alt', { name, n: current + 1, total: count }) : ''} className="object-contain" />
        )}
        {photo?.isPrimary && (
          <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-primary shadow">
            <Icon name="star" />
            {t('primary')}
          </span>
        )}
      </div>

      {count > 1 && (
        <div role="group" aria-label={t('pick')} className="flex flex-wrap gap-2">
          {list.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-current={i === current ? 'true' : undefined}
              aria-label={t('nth', { n: i + 1, total: count })}
              onClick={() => {
                setCurrent(i);
                setShowCutout(false);
              }}
              className="size-14 overflow-hidden rounded-card border-2 border-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-[current=true]:border-primary"
            >
              <PhotoImg src={photoUrl(garmentId, p.id)} />
            </button>
          ))}
        </div>
      )}
      <p className="text-sm text-muted" aria-live="polite">{t('count', { count, max: MAX_PHOTOS })}</p>

      {notice && <Notice ref={noticeRef} {...notice} role={notice.tone === 'success' ? 'status' : 'alert'} />}

      {photo && (
        <div className="flex flex-wrap gap-2">
          {!photo.isPrimary && (
            <Button variant="secondary" className="text-sm" onClick={setPrimary} aria-disabled={busy || undefined}>
              <Icon name="star" />
              {t('setPrimary')}
            </Button>
          )}
          {photo.cutoutStatus === 'READY' ? (
            <Button variant="secondary" className="text-sm" aria-pressed={showCutout} onClick={() => setShowCutout((v) => !v)}>
              {t('showCutout')}
            </Button>
          ) : (
            <Button variant="secondary" className="text-sm" onClick={cutout} aria-disabled={busy || undefined} aria-describedby={`${ids}-cut`}>
              {t('cutout')}
            </Button>
          )}
          <Button variant="danger" className="text-sm" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" />
            {t('delete')}
          </Button>
          <p id={`${ids}-cut`} className="w-full text-xs text-muted">{t('cutoutHint')}</p>
        </div>
      )}

      {staged ? (
        <div className="flex flex-col gap-3 rounded-card border border-neutral-soft bg-surface p-3" role="group" aria-labelledby={`${ids}-st`}>
          <p id={`${ids}-st`} className="font-bold">{t('preview')}</p>
          <div className="mx-auto grid size-48 place-items-center overflow-hidden rounded-card bg-neutral-soft">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={staged.url} alt={t('previewAlt')} className="max-h-full max-w-full transition-transform motion-reduce:transition-none" style={{ transform: `rotate(${staged.rotate}deg)` }} />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" className="text-sm" onClick={() => setStaged((s) => s && { ...s, rotate: nextRotation(s.rotate, -90) })} aria-label={t('rotateLeft')}>
              <Icon name="rotateCcw" />
            </Button>
            <Button variant="secondary" className="text-sm" onClick={() => setStaged((s) => s && { ...s, rotate: nextRotation(s.rotate, 90) })} aria-label={t('rotateRight')}>
              <Icon name="rotateCw" />
            </Button>
          </div>
          <p className="text-xs text-muted">{t('cropNote')}</p>
          {progress !== null && (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-prog`} className="text-sm font-bold">{t('uploading')}</label>
              <progress id={`${ids}-prog`} max={100} value={progress} className="w-full accent-primary">{progress}%</progress>
            </div>
          )}
          <Button variant="primary" className={BLOCK} onClick={upload} aria-disabled={progress !== null || undefined}>
            {progress !== null ? t('uploading') : t('upload')}
          </Button>
          <Button variant="outline" className={BLOCK} onClick={() => setStaged(null)} disabled={progress !== null}>
            {c('cancel')}
          </Button>
        </div>
      ) : count < MAX_PHOTOS ? (
        <div className="flex flex-wrap gap-2">
          <FilePick label={t('camera')} icon="camera" capture onChange={choose} />
          <FilePick label={t('gallery')} icon="image" onChange={choose} />
          <p className="w-full text-xs text-muted">{t('rules')}</p>
        </div>
      ) : (
        <p className="text-sm text-muted">{t('errors.limit')}</p>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete} title={t('deleteTitle')} closeLabel={c('close')} description={t('deleteText')}>
        <div className="flex flex-col gap-2">
          <Button variant="danger" className={BLOCK} onClick={remove} aria-disabled={busy || undefined}>
            <Icon name="trash" />
            {t('delete')}
          </Button>
          <Button variant="outline" className={BLOCK} onClick={() => setConfirmDelete(false)}>{c('cancel')}</Button>
        </div>
      </Dialog>
    </section>
  );
}

/** A button-looking label over a visually hidden (still focusable) file input. */
function FilePick({ label, icon, capture, onChange }: { label: string; icon: 'camera' | 'image'; capture?: boolean; onChange: (e: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-card border-[1.5px] border-primary bg-surface px-4 font-medium text-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary">
      <input type="file" accept="image/jpeg,image/png,image/webp,image/*" {...(capture ? { capture: 'environment' as const } : {})} className="sr-only" onChange={onChange} />
      <Icon name={icon} />
      {label}
    </label>
  );
}
