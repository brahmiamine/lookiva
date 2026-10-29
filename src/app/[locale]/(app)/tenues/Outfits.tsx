'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { Icon } from '@/ui/components/Icon';
import { CHIP, PAGE_TITLE, SELECT } from '../dressing/ui';
import { addDays, groupByDay, isDate, isEditable, missingRoles, todayIn, wallClock, weekOf, type Conflict, type Outfit, type WearRecord } from './logic';
import { CARD, OutfitStatusPill, SECTION, WarningChips } from './ui';

type View = 'day' | 'week';
type Phase = 'loading' | 'ready' | 'error';

export const fmtDay = (locale: string, date: string, long = true) =>
  new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { weekday: long ? 'long' : 'short', day: 'numeric', month: long ? 'long' : 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

export function Outfits({ timezone, initialView, initialDate }: { timezone: string; initialView: string | undefined; initialDate: string | undefined }) {
  const t = useTranslations('outfits');
  const c = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const today = todayIn(timezone);
  const [view, setView] = useState<View>(initialView === 'week' ? 'week' : 'day');
  const [date, setDate] = useState(isDate(initialDate) ? initialDate : today);
  const [phase, setPhase] = useState<Phase>('loading');
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [drafts, setDrafts] = useState<Outfit[]>([]);
  const [worn, setWorn] = useState<WearRecord[] | null>(null);
  const [reload, setReload] = useState(0);
  const toLogin = useCallback(() => router.replace(`/${locale}/login`), [router, locale]);

  const days = view === 'day' ? [date] : weekOf(date);
  const from = days[0]!;
  const to = days.at(-1)!;

  useEffect(() => {
    const q = `?view=${view}&date=${date}`;
    if (window.location.search !== q) window.history.replaceState(null, '', `${window.location.pathname}${q}`);
  }, [view, date]);

  useEffect(() => {
    let live = true;
    Promise.all([
      api<{ items: Outfit[]; truncated?: boolean }>(`/outfits?from=${from}&to=${to}`),
      // ponytail: first 100 drafts only; undated drafts are rare and short-lived.
      api<{ items: Outfit[] }>('/outfits?status=DRAFT&limit=100'),
    ])
      .then(([range, d]) => {
        if (!live) return;
        setOutfits(range.data.items);
        setDrafts(d.data.items.filter((o) => !o.localDate));
        setPhase('ready');
      })
      .catch((e) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 401) return toLogin();
        setPhase('error');
      });
    return () => {
      live = false;
    };
  }, [from, to, reload, toLogin]);

  useEffect(() => {
    api<{ items: WearRecord[] }>('/outfits/last-worn?limit=3')
      .then(({ data }) => setWorn(data.items))
      .catch(() => setWorn([]));
  }, []);

  const go = (next: string, v: View = view) => {
    setPhase('loading');
    setView(v);
    setDate(next);
  };
  const step = view === 'day' ? 1 : 7;

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 pt-5 pb-3">
        <h1 className={PAGE_TITLE}>{t('title')}</h1>
        <Link href={`/${locale}/tenues/modeles`} className={CHIP}>
          <Icon name="star" />
          {t('templates.short')}
        </Link>
      </header>

      <div role="group" aria-label={t('views.label')} className="flex gap-2">
        {(['day', 'week'] as const).map((v) => (
          <button key={v} type="button" className={`${CHIP} flex-1 justify-center`} aria-pressed={view === v} onClick={() => view !== v && go(date, v)}>
            {t(`views.${v}`)}
          </button>
        ))}
      </div>

      <nav aria-label={t('nav.label')} className="mt-3 flex flex-wrap items-end gap-2">
        <Button variant="secondary" aria-label={t(view === 'day' ? 'nav.prevDay' : 'nav.prevWeek')} onClick={() => go(addDays(date, -step))}>
          <Icon name="back" directional />
        </Button>
        <Button variant="secondary" aria-label={t(view === 'day' ? 'nav.nextDay' : 'nav.nextWeek')} onClick={() => go(addDays(date, step))}>
          <Icon name="forward" directional />
        </Button>
        <Button variant="secondary" onClick={() => go(today)} aria-disabled={date === today || undefined}>
          {t('nav.today')}
        </Button>
        <div className="flex min-w-36 flex-1 flex-col gap-1">
          <label htmlFor="outfits-date" className="text-sm font-bold">{t('nav.pickDate')}</label>
          <input id="outfits-date" type="date" className={SELECT} value={date} onChange={(e) => isDate(e.target.value) && go(e.target.value)} />
        </div>
      </nav>

      <h2 className="mt-4 text-lg font-extrabold" aria-live="polite">
        {view === 'day' ? fmtDay(locale, date) : t('weekOf', { from: fmtDay(locale, from, false), to: fmtDay(locale, to, false) })}
      </h2>

      <div className="mt-2" aria-busy={phase === 'loading'}>
        {phase === 'loading' && <p role="status" className="p-6 text-center text-muted">{c('loading')}</p>}
        {phase === 'error' && (
          <ErrorState title={t('loadErrorTitle')} description={t('loadErrorText')} action={<Button variant="danger" onClick={() => { setPhase('loading'); setReload((n) => n + 1); }}>{t('retry')}</Button>} />
        )}
        {phase === 'ready' && view === 'day' && (outfits.length === 0 ? (
          <EmptyState title={t('dayEmptyTitle')} description={t('dayEmptyText')} />
        ) : (
          <OutfitList outfits={groupByDay(outfits, days)[0]!.outfits} />
        ))}
        {phase === 'ready' && view === 'week' && (
          <ol className="flex flex-col gap-1" data-testid="week">
            {groupByDay(outfits, days).map((d) => (
              <li key={d.date} data-date={d.date}>
                <h3 className={SECTION}>
                  <button type="button" className="min-h-11 text-start uppercase underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => go(d.date, 'day')}>
                    {fmtDay(locale, d.date)}
                    {d.date === today && <span> · {t('nav.today')}</span>}
                  </button>
                </h3>
                {d.outfits.length ? <OutfitList outfits={d.outfits} /> : <p className="text-sm text-muted">{t('nothingPlanned')}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>

      <Link href={`/${locale}/tenues/new?date=${date}`} className={`${BLOCK} mt-5 inline-flex items-center justify-center gap-2 rounded-card bg-primary px-4 text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}>
        <Icon name="plus" />
        {t('new')}
      </Link>

      {phase === 'ready' && drafts.length > 0 && (
        <section aria-labelledby="undated">
          <h2 id="undated" className={SECTION}>{t('undated')}</h2>
          <OutfitList outfits={drafts} />
        </section>
      )}

      <section aria-labelledby="last-worn">
        <h2 id="last-worn" className={SECTION}>{t('lastWorn.title')}</h2>
        {worn === null ? (
          <p role="status" className="text-sm text-muted">{c('loading')}</p>
        ) : worn.length === 0 ? (
          <p className="text-sm text-muted">{t('lastWorn.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="last-worn">
            {worn.map((r) => (
              <li key={r.id}>
                <Link href={`/${locale}/tenues/${r.outfitId}`} className={`${CARD} flex min-h-12 flex-wrap items-center justify-between gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}>
                  <span className="font-bold"><bdi>{r.title || r.occasion || t('untitled')}</bdi></span>
                  <span className="text-sm text-muted">{fmtDay(locale, r.localDate)} · {t('pieces', { count: r.items.length })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function OutfitList({ outfits }: { outfits: Outfit[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {outfits.map((o) => (
        <li key={o.id}>
          <OutfitRow outfit={o} />
        </li>
      ))}
    </ul>
  );
}

function OutfitRow({ outfit: o }: { outfit: Outfit }) {
  const t = useTranslations('outfits');
  const locale = useLocale();
  const [conflicts, setConflicts] = useState(0);
  const editable = isEditable(o.status);
  useEffect(() => {
    if (!editable || !o.items.length) return;
    let live = true;
    // ponytail: one conflicts call per editable outfit in view (list responses carry no warnings); fine for a day/week.
    api<{ conflicts: Conflict[] }>(`/outfits/${o.id}/conflicts`)
      .then(({ data }) => live && setConflicts(data.conflicts.length))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [o.id, o.version, editable, o.items.length]);
  const time = o.localTime ? (o.endsAt && o.timezone ? `${o.localTime} – ${wallClock(o.endsAt, o.timezone).time}` : o.localTime) : t('noTime');
  const warnings = editable ? [...missingRoles(o.items.map((i) => i.role)).map((r) => t('warnings.MISSING_ROLE', { role: t(`role.${r}`) })), ...(conflicts ? [t('warnings.conflicts', { count: conflicts })] : [])] : [];
  return (
    <Link href={`/${locale}/tenues/${o.id}`} data-outfit={o.id} className={`${CARD} flex flex-col gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold text-muted">
          <Icon name="clock" />
          <span dir="ltr">{time}</span>
        </span>
        <OutfitStatusPill status={o.status} />
      </span>
      <span className="text-base font-extrabold"><bdi>{o.title || t('untitled')}</bdi></span>
      <span className="text-sm text-muted">
        {o.occasion ? <bdi>{o.occasion}</bdi> : t('noOccasion')} · {t('pieces', { count: o.items.length })}
      </span>
      <WarningChips items={warnings} label={t('warnings.label')} />
    </Link>
  );
}
