'use client';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Notice } from '@/ui/components/Notice';
import { TextField } from '@/ui/components/TextField';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';

const CHECK = 'flex min-h-11 items-center gap-2.5 rounded-card border-[1.5px] border-border bg-surface px-3 has-[:checked]:border-2 has-[:checked]:border-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary';

/** Creates a DRAFT outfit. One Idempotency-Key per attempt: a network retry reuses it, so the outfit is not created twice. */
export function NewOutfitForm({ garments }: { garments: { id: string; name: string }[] }) {
  const t = useTranslations('wardrobe.outfits');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const key = useRef(crypto.randomUUID());
  useFocusOn(noticeRef, notice);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (picked.length === 0) return setNotice({ tone: 'warning', title: t('pickOne') });
    setBusy(true);
    setNotice(null);
    try {
      const r = await api<{ id: string }>('/outfits', { method: 'POST', body: { name: name.trim() || null, garmentIds: picked }, idempotent: key.current });
      router.push(`/${locale}/wardrobe/outfits/${r.data.id}`);
      return;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return router.replace(`/${locale}/login`);
      if (!(err instanceof ApiError && err.code === 'NETWORK_ERROR')) key.current = crypto.randomUUID();
      setNotice(genericNotice(err));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3.5">
      {notice && <Notice ref={noticeRef} {...notice} />}
      <TextField label={t('name')} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">{t('pick')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {garments.map((g) => (
            <label key={g.id} className={CHECK}>
              <input type="checkbox" className="size-5 accent-primary" checked={picked.includes(g.id)} onChange={() => toggle(g.id)} />
              <span className="min-w-0 truncate">{g.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" variant="primary" className={BLOCK} aria-disabled={busy || undefined}>
        {t('create')}
      </Button>
    </form>
  );
}
