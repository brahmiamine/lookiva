'use client';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { Button } from '@/ui/components/Button';
import { Notice } from '@/ui/components/Notice';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import type { GroupKind, Organizer } from '@/ui/wardrobe';

const INPUT = 'min-h-12 flex-1 rounded-card border-[1.5px] border-border bg-surface px-3.5 text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** Rename and delete of tags, collections and sets. Deleting a group never touches its garments. */
export function ManageGroups({ lists }: { lists: { kind: GroupKind; items: Organizer[] }[] }) {
  const t = useTranslations('wardrobe.organize');
  const errors = useTranslations('wardrobe.errors');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [armed, setArmed] = useState<string | null>(null); // delete needs a second press on the same row
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useFocusOn(noticeRef, notice);

  async function run(action: () => Promise<unknown>, doneText?: string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await action();
      if (doneText) setNotice({ tone: 'success', title: doneText });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return router.replace(`/${locale}/login`);
      setNotice(err instanceof ApiError && err.code === 'VERSION_CONFLICT' ? { tone: 'warning', title: errors('conflict') } : genericNotice(err));
    }
    setBusy(false);
  }

  const rename = (kind: GroupKind, g: Organizer) => {
    const name = (drafts[g.id] ?? g.name).trim();
    if (!name || name === g.name) return;
    void run(async () => {
      await api(`/${kind}/${g.id}`, { method: 'PATCH', body: { name }, ifMatch: `W/"v${g.version}"` });
      setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== g.id)));
    }, t('renamed'));
  };

  const remove = (kind: GroupKind, g: Organizer) => {
    if (armed !== g.id) return setArmed(g.id);
    setArmed(null);
    void run(() => api(`/${kind}/${g.id}`, { method: 'DELETE' }), t('removed'));
  };

  return (
    <div className="flex flex-col gap-6">
      {notice && <Notice ref={noticeRef} {...notice} />}
      {lists.map(({ kind, items }) => (
        <section key={kind} className="flex flex-col gap-2.5">
          <h2 className="text-lg font-bold">{t(kind === 'garment-sets' ? 'sets' : kind)}</h2>
          {items.length === 0 && <p className="text-sm text-muted">{t('none')}</p>}
          {items.map((g) => {
            const draft = drafts[g.id] ?? g.name;
            const count = g.garments.filter((x) => !x.trashed).length;
            return (
              <div key={g.id} className="flex flex-col gap-2 rounded-card border border-neutral-soft bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`group-${g.id}`}>
                    {t('name')}
                  </label>
                  <input id={`group-${g.id}`} className={INPUT} maxLength={60} value={draft} onChange={(e) => setDrafts((d) => ({ ...d, [g.id]: e.target.value }))} />
                  <Button variant="outline" className="min-h-12" onClick={() => rename(kind, g)} aria-disabled={busy || draft.trim() === g.name || undefined}>
                    {t('save')}
                  </Button>
                  <Button variant="danger" className="min-h-12" onClick={() => remove(kind, g)} aria-disabled={busy || undefined}>
                    {armed === g.id ? t('confirmRemove') : t('remove')}
                  </Button>
                </div>
                <p className="text-sm text-muted">{t('count', { count })}</p>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
