'use client';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Dialog } from '@/ui/components/Dialog';
import { Notice } from '@/ui/components/Notice';
import { StatusPill } from '../dressing/ui';
import type { WashResult, WearRecord } from './logic';

type Line = { garmentId: string; name: string; status: string | null };

/**
 * OPTIONAL wash proposal after a confirmed wear. Every box starts unchecked; "Skip" sends nothing; only the checked
 * garments are sent. A failed request never shows a success, and per-garment outcomes are listed as the server gave them.
 */
export function WashPanel({
  open, record, lines, onClose, onDone, onUnauthorized,
}: {
  open: boolean;
  record: WearRecord;
  /** The garments actually worn that still exist, with their current status. */
  lines: Line[];
  onClose: () => void;
  onDone: (r: WashResult) => void;
  onUnauthorized: () => void;
}) {
  const t = useTranslations('outfits.wash');
  const w = useTranslations('wardrobe.status');
  const c = useTranslations('common');
  const [checked, setChecked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WashResult | null>(null);
  const [failed, setFailed] = useState(false);
  const key = useRef('');

  const toggle = (id: string) => {
    key.current = ''; // another selection is another intent
    setChecked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const nameOf = (id: string) => lines.find((l) => l.garmentId === id)?.name ?? id;

  async function submit() {
    if (busy || !checked.length) return;
    setBusy(true);
    setFailed(false);
    key.current ||= crypto.randomUUID(); // kept across a retry of the same selection
    try {
      const { data } = await api<WashResult>(`/wear-records/${record.id}/mark-to-wash`, { method: 'POST', idempotent: key.current, body: { garmentIds: checked } });
      setResult(data);
      onDone(data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onUnauthorized();
      setFailed(true);
    }
    setBusy(false);
  }

  const close = () => {
    setChecked([]);
    setResult(null);
    setFailed(false);
    key.current = '';
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title={t('title')} closeLabel={c('close')} description={t('text')}>
      {result ? (
        <>
          <Notice
            tone={result.failed.length || result.skipped.length ? 'warning' : 'success'}
            title={result.marked.length ? t('markedTitle', { count: result.marked.length }) : t('noneMarkedTitle')}
            text={result.failed.length || result.skipped.length ? t('partialText') : undefined}
          />
          <ul className="flex flex-col gap-1.5 text-sm" data-testid="wash-results">
            {result.marked.map((id) => (
              <li key={id} className="font-semibold text-success">{t('marked', { name: nameOf(id) })}</li>
            ))}
            {result.skipped.map((s) => (
              <li key={s.garmentId} className="font-semibold text-warning">{t('skipped', { name: nameOf(s.garmentId), status: w(s.status as 'AVAILABLE') })}</li>
            ))}
            {result.failed.map((f) => (
              <li key={f.garmentId} className="font-semibold text-danger">{t('failed', { name: nameOf(f.garmentId) })}</li>
            ))}
          </ul>
          <Button variant="primary" className={BLOCK} onClick={close}>{c('close')}</Button>
        </>
      ) : (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">{t('legend')}</legend>
            {lines.length === 0 ? (
              <p className="text-sm text-muted">{t('nothing')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {lines.map((l) => (
                  <li key={l.garmentId}>
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-card border-[1.5px] border-border px-3 py-2 has-[:checked]:border-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary">
                      <input type="checkbox" className="size-5 flex-none accent-primary focus:outline-none" checked={checked.includes(l.garmentId)} onChange={() => toggle(l.garmentId)} />
                      <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                        <bdi className="font-semibold">{l.name}</bdi>
                        {l.status && (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <span className="sr-only">{t('current')}</span>
                            <StatusPill status={l.status} />
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          {failed && <Notice tone="danger" role="alert" title={t('errorTitle')} text={t('errorText')} />}
          <div className="flex flex-col gap-2">
            <Button variant="primary" className={BLOCK} onClick={submit} aria-disabled={busy || !checked.length || undefined}>
              {busy ? c('loading') : t('mark', { count: checked.length })}
            </Button>
            <Button variant="outline" className={BLOCK} onClick={close}>{t('skip')}</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
