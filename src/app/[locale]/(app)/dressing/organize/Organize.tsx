'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { ApiError, api, retryMinutes } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Dialog } from '@/ui/components/Dialog';
import { Icon } from '@/ui/components/Icon';
import { Notice } from '@/ui/components/Notice';
import { TextField } from '@/ui/components/TextField';
import { useErrorNotice, type NoticeData } from '@/ui/form-helpers';
import { limitKey } from '../logic';
import { etagOf, garmentName, type Catalog, type Garment, type Organizer, type OrganizerKind, type Page } from '../types';
import { PAGE_TITLE } from '../ui';

const KINDS: OrganizerKind[] = ['tags', 'collections', 'garment-sets'];
const MAX: Record<OrganizerKind, number> = { tags: 40, collections: 60, 'garment-sets': 60 };

/** Tags, collections and garment sets: create, rename, delete, view members. Compact on purpose. */
export function Organize({ catalog }: { catalog: Catalog }) {
  const t = useTranslations('wardrobe.organize');
  return (
    <>
      <h1 className={`${PAGE_TITLE} mt-2`}>{t('title')}</h1>
      <p className="mb-2 text-[15px] text-muted">{t('lead')}</p>
      {KINDS.map((k) => <Section key={k} kind={k} catalog={catalog} />)}
    </>
  );
}

function Section({ kind, catalog }: { kind: OrganizerKind; catalog: Catalog }) {
  const t = useTranslations('wardrobe.organize');
  const lim = useTranslations('wardrobe.limits');
  const c = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const ids = useId();
  const [items, setItems] = useState<Organizer[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [renaming, setRenaming] = useState<Organizer | null>(null);
  const [deleting, setDeleting] = useState<Organizer | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) return router.replace(`/${locale}/login`);
      if (e instanceof ApiError && e.code === 'NAME_ALREADY_USED') return setError(t('nameUsed'));
      if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') return setNotice({ tone: 'warning', title: t('conflict') });
      const limit = e instanceof ApiError && e.status !== 429 ? limitKey(e.status, e.code) : null; // 429 here = write budget: generic notice
      if (limit && e instanceof ApiError) return setNotice({ tone: 'warning', title: lim(limit, { minutes: retryMinutes(e) }) });
      setNotice(genericNotice(e));
    },
    [router, locale, t, lim, genericNotice],
  );
  const load = useCallback(async () => {
    try {
      setItems((await api<Page<Organizer>>(`/${kind}?limit=100`)).data.items);
    } catch (e) {
      fail(e);
      setItems([]);
    }
  }, [kind, fail]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is only set after the await
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setNotice(null);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(c('required'));
    if (await run(() => api(`/${kind}`, { method: 'POST', body: { name: name.trim() } }))) setName('');
  }

  return (
    <section aria-labelledby={`${ids}-h`} className="mt-6">
      <h2 id={`${ids}-h`} className="mb-2 text-lg font-extrabold">{t(`kinds.${kind}`)}</h2>
      {notice && <div className="mb-2"><Notice {...notice} role="alert" /></div>}
      <form onSubmit={create} noValidate className="flex items-end gap-2">
        <div className="flex-1">
          <TextField label={t(`newName.${kind}`)} value={name} maxLength={MAX[kind]} onChange={(e) => setName(e.target.value)} error={error} />
        </div>
        <Button type="submit" variant="primary" className="mb-1 min-h-13" aria-disabled={busy || undefined}>
          <Icon name="plus" />
          {t('create')}
        </Button>
      </form>
      {items === null ? (
        <p role="status" className="py-3 text-sm text-muted">{c('loading')}</p>
      ) : items.length === 0 ? (
        <p className="py-3 text-sm text-muted">{t('empty')}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((o) => (
            <li key={o.id} className="rounded-card border border-neutral-soft bg-surface p-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="me-auto font-bold"><bdi>{o.name}</bdi> <span className="text-sm font-medium text-muted">· {t('members', { count: o.garments.length })}</span></p>
                <Button variant="secondary" className="text-sm" onClick={() => setRenaming(o)} aria-label={t('renameLabel', { name: o.name })}>{t('rename')}</Button>
                <Button variant="danger" className="text-sm" onClick={() => setDeleting(o)} aria-label={t('deleteLabel', { name: o.name })}>{t('delete')}</Button>
              </div>
              {o.garments.length > 0 && <Members organizer={o} catalog={catalog} />}
            </li>
          ))}
        </ul>
      )}

      <RenameDialog
        organizer={renaming}
        max={MAX[kind]}
        busy={busy}
        error={error}
        onClose={() => {
          setRenaming(null);
          setError(undefined);
        }}
        onSave={async (o, newName) => {
          if (await run(() => api(`/${kind}/${o.id}`, { method: 'PATCH', body: { name: newName }, ifMatch: etagOf(o.version) }))) setRenaming(null);
        }}
      />
      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)} title={t('deleteTitle', { name: deleting?.name ?? '' })} closeLabel={c('close')} description={t('deleteText')}>
        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            className={BLOCK}
            aria-disabled={busy || undefined}
            onClick={async () => {
              const o = deleting;
              if (o && (await run(() => api(`/${kind}/${o.id}`, { method: 'DELETE' })))) setDeleting(null);
            }}
          >
            {t('delete')}
          </Button>
          <Button variant="outline" className={BLOCK} onClick={() => setDeleting(null)}>{c('cancel')}</Button>
        </div>
      </Dialog>
    </section>
  );
}

function RenameDialog({ organizer, max, busy, error, onClose, onSave }: { organizer: Organizer | null; max: number; busy: boolean; error?: string; onClose: () => void; onSave: (o: Organizer, name: string) => void }) {
  const t = useTranslations('wardrobe.organize');
  const c = useTranslations('common');
  const [name, setName] = useState('');
  const [prev, setPrev] = useState<Organizer | null>(null);
  if (organizer !== prev) {
    setPrev(organizer);
    setName(organizer?.name ?? '');
  }
  return (
    <Dialog open={organizer !== null} onOpenChange={(o) => !o && onClose()} title={t('rename')} closeLabel={c('close')}>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (organizer && name.trim()) onSave(organizer, name.trim());
        }}
      >
        <TextField label={t('name')} value={name} maxLength={max} onChange={(e) => setName(e.target.value)} error={error} />
        <Button type="submit" variant="primary" className={BLOCK} aria-disabled={busy || undefined}>{t('save')}</Button>
        <Button variant="outline" className={BLOCK} onClick={onClose}>{c('cancel')}</Button>
      </form>
    </Dialog>
  );
}

/** Member names, read on demand (the list only carries ids). */
function Members({ organizer, catalog }: { organizer: Organizer; catalog: Catalog }) {
  const t = useTranslations('wardrobe.organize');
  const locale = useLocale();
  const [names, setNames] = useState<Record<string, string> | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || names) return;
    // ponytail: one GET per member (max 50 shown); a batch read endpoint if lists get big.
    void Promise.all(
      organizer.garments.slice(0, 50).map(async (m) => {
        if (m.trashed) return [m.id, ''] as const;
        const r = await api<Garment>(`/garments/${m.id}`).catch(() => null);
        return [m.id, r ? garmentName(r.data, catalog) : ''] as const;
      }),
    ).then((pairs) => setNames(Object.fromEntries(pairs)));
  }, [open, names, organizer.garments, catalog]);

  return (
    <details className="mt-2" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-primary">{t('viewMembers')}</summary>
      {open && !names ? (
        <p role="status" className="text-sm text-muted">{t('loadingMembers')}</p>
      ) : (
        <ul className="flex flex-col gap-1 ps-2">
          {organizer.garments.slice(0, 50).map((m) => (
            <li key={m.id} className="text-sm">
              {m.trashed || !names?.[m.id] ? (
                <span className="text-muted">{t('trashedMember')}</span>
              ) : (
                <Link href={`/${locale}/dressing/${m.id}`} className="inline-flex min-h-11 items-center font-semibold underline"><bdi>{names[m.id]!}</bdi></Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
