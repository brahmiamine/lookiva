'use client';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { Icon } from '@/ui/components/Icon';
import { StatusBadge } from '@/ui/components/StatusBadge';
import { garmentName, type Catalog, type Garment } from '../dressing/types';
import { OUTFIT_LOOK, type OutfitStatus, type Snapshot } from './logic';

export function OutfitStatusPill({ status }: { status: OutfitStatus }) {
  const t = useTranslations('outfits.status');
  const look = OUTFIT_LOOK[status];
  return <StatusBadge tone={look.tone} label={t(status)} icon={<Icon name={look.icon} />} />;
}

/** Advisory chips (missing roles, conflicts): outlined + warning icon, visually distinct from the status pill. */
export function WarningChips({ items, label }: { items: string[]; label: string }) {
  if (!items.length) return null;
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((w, i) => (
        <li key={i} className="inline-flex items-center gap-1 rounded-md border border-warning px-2 py-0.5 text-xs font-bold text-warning">
          <Icon name="warn" />
          {w}
        </li>
      ))}
    </ul>
  );
}

export const snapshotName = (s: Snapshot, catalog: Catalog) =>
  garmentName({ nickname: s.nickname, categoryCode: s.categoryCode, subtypeCode: s.subtypeCode, customSubcategory: s.customSubtypeLabel ? { id: '', label: s.customSubtypeLabel, parentSubtypeCode: '' } : null }, catalog);

/** Garments by id, fetched on demand (null = not found: trashed, purged or foreign). */
export function useGarments(onUnauthorized: () => void) {
  const [map, setMap] = useState<Record<string, Garment | null>>({});
  const known = useRef(new Set<string>());
  const load = useCallback(
    async (ids: string[], force = false) => {
      const todo = [...new Set(ids)].filter((id) => force || !known.current.has(id));
      if (!todo.length) return;
      todo.forEach((id) => known.current.add(id));
      // ponytail: one GET per garment (no batch read endpoint); add ?ids= to /garments if outfits grow past a dozen pieces.
      const got = await Promise.all(
        todo.map((id) =>
          api<Garment>(`/garments/${id}`)
            .then((r) => [id, r.data] as const)
            .catch((e) => {
              if (e instanceof ApiError && e.status === 401) onUnauthorized();
              return [id, e instanceof ApiError && e.status === 404 ? null : undefined] as const;
            }),
        ),
      );
      setMap((m) => ({ ...m, ...(Object.fromEntries(got.filter(([, g]) => g !== undefined)) as Record<string, Garment | null>) }));
      got.filter(([, g]) => g === undefined).forEach(([id]) => known.current.delete(id)); // transient failure: retried next time
    },
    [onUnauthorized],
  );
  return { garments: map, load };
}

export const LINK_BTN =
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-card px-4 text-base font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
export const SECTION = 'mt-6 mb-2 text-[13px] font-extrabold tracking-wide text-muted uppercase';
export const CARD = 'rounded-card border border-neutral-soft bg-surface p-3.5 shadow-sm';
