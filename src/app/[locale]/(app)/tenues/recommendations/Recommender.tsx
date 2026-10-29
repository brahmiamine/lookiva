'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { Button } from '@/ui/components/Button';
import { ErrorState } from '@/ui/components/ErrorState';
import { Icon } from '@/ui/components/Icon';
import { garmentName, type Catalog, type Garment } from '../../dressing/types';
import { SELECT } from '../../dressing/ui';
import { zonedInstant, type Role } from '../logic';
import { CARD, useGarments } from '../ui';

type Occasion = 'CASUAL' | 'WORK' | 'FORMAL' | 'SPORT' | 'EVENING' | 'HOME' | 'TRADITIONAL';
type Proposal = {
  fingerprint: string;
  items: { garmentId: string; role: Exclude<Role, 'ACCESSORY' | 'OTHER'> }[];
  missing: string[];
  reasons: { code: string }[];
  warnings: { code: string }[];
  assumptions: { code: string }[];
};
type Result = {
  sessionId: string;
  weatherAvailable: boolean;
  manualFallback: boolean;
  proposals: Proposal[];
  exhausted: boolean;
};
const OCCASIONS: Occasion[] = ['CASUAL', 'WORK', 'FORMAL', 'SPORT', 'EVENING', 'HOME', 'TRADITIONAL'];

export function Recommender({ catalog, timezone, initialDate }: { catalog: Catalog; timezone: string; initialDate: string }) {
  const t = useTranslations('outfits.recommendations');
  const r = useTranslations('outfits.role');
  const c = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const [date, setDate] = useState(initialDate);
  const [from, setFrom] = useState(8);
  const [to, setTo] = useState(20);
  const [occasion, setOccasion] = useState<Occasion>('CASUAL');
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const createKey = useRef('');
  const sessionIntent = useRef('');
  const toLogin = useCallback(() => router.replace(`/${locale}/login`), [router, locale]);
  const { garments, load } = useGarments(toLogin);

  const ids = result?.proposals.flatMap((p) => p.items.map((i) => i.garmentId)) ?? [];
  const joinedIds = ids.join(',');
  useEffect(() => {
    if (joinedIds) void load(joinedIds.split(','));
  }, [joinedIds, load]);

  async function generate() {
    if (busy || from > to) return;
    setBusy(true);
    setError(false);
    setSaved(false);
    setSelected(null);
    createKey.current = '';
    const intent = `${date}|${from}|${to}|${occasion}`;
    try {
      const response = await api<Result>('/recommendations/outfits', {
        method: 'POST',
        body: { date, from, to, occasion, count: 3, useAi: false, ...(sessionIntent.current === intent && result ? { sessionId: result.sessionId } : {}) },
      });
      sessionIntent.current = intent;
      setResult(response.data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) toLogin();
      else setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function saveProposal() {
    if (selected === null || !result || busy) return;
    const proposal = result.proposals[selected];
    if (!proposal) return;
    setBusy(true);
    setError(false);
    createKey.current ||= crypto.randomUUID();
    try {
      const created = await api<{ id: string }>('/outfits', {
        method: 'POST',
        idempotent: createKey.current,
        body: {
          status: 'PLANNED',
          occasion: t(`occasions.${occasion}`),
          startsAt: zonedInstant(date, `${String(from).padStart(2, '0')}:00`, timezone),
          timezone,
          items: proposal.items.map(({ garmentId, role }) => ({ garmentId, role })),
        },
      });
      setSaved(true);
      createKey.current = '';
      router.push(`/${locale}/tenues/${created.data.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) toLogin();
      else setError(true);
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (g: Garment | null | undefined) => g ? garmentName(g, catalog) : c('loading');

  return (
    <>
      <header className="flex items-center justify-between gap-3 pt-5 pb-3">
        <h1 className="text-2xl font-extrabold text-primary">{t('title')}</h1>
        <Link href={`/${locale}/tenues`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary">
          <Icon name="back" directional />{t('back')}
        </Link>
      </header>
      <p className="mb-4 text-sm text-muted">{t('lead')}</p>

      <section className={`${CARD} grid gap-3`} aria-label={t('controls')}>
        <label className="grid gap-1 text-sm font-semibold" htmlFor="recommendation-date">{t('date')}
          <input id="recommendation-date" className={SELECT} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm font-semibold" htmlFor="recommendation-from">{t('from')}
            <select id="recommendation-from" className={SELECT} value={from} onChange={(e) => setFrom(Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
          </label>
          <label className="grid gap-1 text-sm font-semibold" htmlFor="recommendation-to">{t('to')}
            <select id="recommendation-to" className={SELECT} value={to} onChange={(e) => setTo(Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
          </label>
        </div>
        <label className="grid gap-1 text-sm font-semibold" htmlFor="recommendation-occasion">{t('occasion')}
          <select id="recommendation-occasion" className={SELECT} value={occasion} onChange={(e) => setOccasion(e.target.value as Occasion)}>{OCCASIONS.map((o) => <option key={o} value={o}>{t(`occasions.${o}`)}</option>)}</select>
        </label>
        <Button variant="primary" onClick={() => void generate()} disabled={busy || from > to}>{busy ? t('working') : t('generate')}</Button>
        {from > to && <p role="alert" className="text-sm text-danger">{t('invalidHours')}</p>}
      </section>

      {error && <div className="mt-4"><ErrorState title={t('errorTitle')} description={t('errorText')} action={<Button variant="secondary" onClick={() => selected === null ? void generate() : void saveProposal()}>{t('retry')}</Button>} /></div>}
      {result?.manualFallback && <p role="status" className="mt-4 rounded-card border border-warning bg-warning-soft p-3 text-sm">{t('manualFallback')}</p>}
      {result && result.proposals.length === 0 && <p className="mt-4 rounded-card bg-neutral-soft p-4 text-sm">{t('empty')}</p>}

      {result && result.proposals.length > 0 && (
        <section className="mt-5" aria-labelledby="recommendation-results">
          <h2 id="recommendation-results" className="mb-2 text-lg font-extrabold">{t('results', { count: result.proposals.length })}</h2>
          <ol className="grid gap-3">
            {result.proposals.map((proposal, index) => (
              <li key={proposal.fingerprint}>
                <button type="button" aria-pressed={selected === index} onClick={() => { setSelected(index); setSaved(false); createKey.current = ''; }} className={`${CARD} w-full text-start focus-visible:outline-2 focus-visible:outline-primary aria-pressed:border-2 aria-pressed:border-primary`}>
                  <span className="flex items-center justify-between gap-2 font-bold"><span>{t('proposal', { number: index + 1 })}</span><span className="text-sm text-muted">{t('choose')}</span></span>
                  <ul className="mt-2 grid gap-1 text-sm">
                    {proposal.items.map(({ garmentId, role }) => <li key={garmentId} className="flex justify-between gap-2"><span>{r(role)} · {nameOf(garments[garmentId])}</span><span aria-hidden="true">✓</span></li>)}
                  </ul>
                  {proposal.missing.length > 0 && <p className="mt-2 text-sm text-warning">{t('missing', { roles: proposal.missing.map((role) => r(role as Role)).join(', ') })}</p>}
                  {proposal.assumptions.length > 0 && <p className="mt-1 text-sm text-muted">{t('assumptions', { count: proposal.assumptions.length })}</p>}
                </button>
              </li>
            ))}
          </ol>
          {result.exhausted && <p className="mt-3 text-sm text-muted">{t('exhausted')}</p>}
          <Button variant="secondary" className="mt-4 w-full" onClick={() => void generate()} disabled={busy}>{busy ? t('working') : t('more')}</Button>
          {selected !== null && <Button variant="primary" className="mt-2 w-full" onClick={() => void saveProposal()} disabled={busy}>{busy ? t('working') : t('save')}</Button>}
          {saved && <p role="status" className="mt-3 text-sm text-success">{t('saved')}</p>}
        </section>
      )}
    </>
  );
}
