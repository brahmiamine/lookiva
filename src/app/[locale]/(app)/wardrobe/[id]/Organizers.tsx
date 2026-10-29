'use client';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { Button } from '@/ui/components/Button';
import { Notice } from '@/ui/components/Notice';
import { TextField } from '@/ui/components/TextField';
import { useErrorNotice, type NoticeData } from '@/ui/form-helpers';
import type { GroupKind, GroupSet } from '@/ui/wardrobe';

/** Membership of one garment in each group, plus creation of a new group. Changes re-read the page. */
export function Organizers({ garmentId, groups }: { garmentId: string; groups: GroupSet[] }) {
  const t = useTranslations('wardrobe.organize');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [names, setNames] = useState<Partial<Record<GroupKind, string>>>({});

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return router.replace(`/${locale}/login`);
      setNotice(genericNotice(err));
    }
    setBusy(false);
  }

  const toggle = (kind: GroupKind, id: string, member: boolean) =>
    run(() => (member ? api(`/${kind}/${id}/garments/${garmentId}`, { method: 'DELETE' }) : api(`/${kind}/${id}/garments`, { method: 'POST', body: { garmentIds: [garmentId] } })));

  const create = (kind: GroupKind) => {
    const name = names[kind]?.trim();
    if (!name) return;
    void run(async () => {
      await api(`/${kind}`, { method: 'POST', body: { name } });
      setNames((n) => ({ ...n, [kind]: '' }));
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {notice && <Notice {...notice} />}
      {groups.map((g) => (
        <section key={g.kind} className="flex flex-col gap-2">
          <h3 className="text-base font-bold">{t(g.kind === 'garment-sets' ? 'sets' : g.kind)}</h3>
          {g.items.length === 0 ? (
            <p className="text-sm text-muted">{t('none')}</p>
          ) : (
            <ul role="list" className="flex flex-col gap-2">
              {g.items.map((item) => (
                <li key={item.id}>
                  <label className="flex min-h-11 items-center gap-3 rounded-card border-[1.5px] border-border bg-surface px-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary">
                    <input type="checkbox" className="size-5 accent-primary" checked={item.member} disabled={busy} onChange={() => toggle(g.kind, item.id, item.member)} />
                    <span>{item.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextField label={t('name')} maxLength={60} value={names[g.kind] ?? ''} onChange={(e) => setNames((n) => ({ ...n, [g.kind]: e.target.value }))} />
            </div>
            <Button variant="outline" className="min-h-13" onClick={() => create(g.kind)} aria-disabled={busy || !names[g.kind]?.trim() || undefined}>
              {t('create')}
            </Button>
          </div>
        </section>
      ))}
    </div>
  );
}
