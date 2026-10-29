'use client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { api } from '@/ui/api-client';
import { Icon, type IconName } from '@/ui/components/Icon';
import { StatusBadge } from '@/ui/components/StatusBadge';
import type { Photo } from './types';

// Text + icon + colour for each of the 6 statuses: colour is never the only cue.
export const STATUS_LOOK: Record<string, { tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; icon: IconName }> = {
  AVAILABLE: { tone: 'success', icon: 'check' },
  TO_WASH: { tone: 'warning', icon: 'drop' },
  WASHING: { tone: 'info', icon: 'drop' },
  DRYING: { tone: 'info', icon: 'wind' },
  IN_REPAIR: { tone: 'danger', icon: 'repair' },
  LENT: { tone: 'neutral', icon: 'lend' },
};

export function StatusPill({ status }: { status: string }) {
  const t = useTranslations('wardrobe.status');
  const look = STATUS_LOOK[status] ?? { tone: 'neutral', icon: 'info' };
  return <StatusBadge tone={look.tone} label={t(status as 'AVAILABLE')} icon={<Icon name={look.icon} />} />;
}

/** Generic garment illustration: no photo, or the image could not be loaded. */
export function Placeholder({ className = 'size-11' }: { className?: string }) {
  return (
    <div data-slot="placeholder" aria-hidden="true" className="grid h-full w-full place-items-center bg-neutral-soft text-neutral">
      <Icon name="shirt" className={`stroke-[1.2] ${className}`} />
    </div>
  );
}

export const photoUrl = (garmentId: string, photoId: string, variant: 'thumb' | 'optimized' | 'cutout' = 'thumb') =>
  `/api/v1/garments/${garmentId}/photos/${photoId}/file?variant=${variant}`;

/** <img> that falls back to the illustration when the file is missing or broken. Decorative (the name is next to it). */
export function PhotoImg({ src, alt = '', className = '' }: { src: string | null; alt?: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <Placeholder />;
  // eslint-disable-next-line @next/next/no-img-element -- private, session-bound bytes: never through the public image optimizer
  return <img src={src} alt={alt} data-slot="photo" onError={() => setFailed(src)} className={`h-full w-full object-cover ${className}`} />;
}

/** Thumbnail of a garment's primary photo (the list endpoint does not carry photos: one small request per card). */
export function GarmentThumb({ garmentId }: { garmentId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    // ponytail: N+1 (one /photos call per card); add primaryPhotoId to the list view if galleries get slow.
    api<{ items: Photo[] }>(`/garments/${garmentId}/photos`)
      .then(({ data }) => {
        const p = data.items.find((x) => x.isPrimary) ?? data.items[0];
        if (live && p) setSrc(photoUrl(garmentId, p.id));
      })
      .catch(() => undefined); // the illustration stays
    return () => {
      live = false;
    };
  }, [garmentId]);
  return <PhotoImg src={src} />;
}

export const CHIP =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] border-border bg-surface px-3.5 text-sm font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-on-primary';
export const SELECT =
  'min-h-11 w-full rounded-card border-[1.5px] border-border bg-surface px-3 text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
export const PAGE_TITLE = 'text-2xl font-extrabold text-primary focus:outline-none';
