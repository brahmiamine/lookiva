import Link from 'next/link';
import { wardrobeRoutes } from '@/modules/wardrobe';
import { getMessage } from '@/i18n/messages';
import { Icon } from '@/ui/components/Icon';
import { addDays, isoDay, weekStart } from '@/ui/week';
import { pageLocale, titleFrom } from '../../../page-helpers';
import { getJson, requireAccount } from '../../server-api';
import { H1, LEAD, SECTION } from '../../styles';

export const generateMetadata = titleFrom('wardrobe.outfits.title');

type Planned = { id: string; name: string | null; status: string; plannedFor: string; occasion: string | null };

/** Read-only week of planned outfits. Days and times are UTC until the planning time-zone rule is decided. */
export default async function OutfitsWeekPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = await pageLocale(props);
  await requireAccount(locale, 'onboarded');
  const sp = await props.searchParams;
  const raw = typeof sp.week === 'string' ? sp.week : '';
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) ? new Date(`${raw}T00:00:00Z`) : new Date();
  const start = weekStart(anchor);
  const end = addDays(start, 7);
  const { items } = await getJson<{ items: Planned[] }>(wardrobeRoutes.listOutfits, `/outfits?from=${start.toISOString()}&to=${end.toISOString()}`, locale);

  const t = (key: string, values?: Record<string, string>) => getMessage(locale, `wardrobe.${key}`).replace(/\{(\w+)\}/g, (_, k) => values?.[k] ?? '');
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { ...opts, timeZone: 'UTC' }).format(d);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const byDay = new Map<string, Planned[]>();
  for (const o of items) byDay.set(isoDay(new Date(o.plannedFor)), [...(byDay.get(isoDay(new Date(o.plannedFor))) ?? []), o]);

  return (
    <main className="flex flex-col gap-4 pb-8 font-sans">
      <Link href={`/${locale}/wardrobe`} className="mt-2 inline-flex min-h-11 items-center gap-2 self-start font-bold text-primary">
        <Icon name="back" directional />
        {t('back')}
      </Link>
      <h1 className={H1}>{t('outfits.title')}</h1>
      <p className={LEAD}>{t('outfits.weekOf', { date: fmt(start, { dateStyle: 'medium' }) })}</p>

      <Link href={`/${locale}/wardrobe/outfits/new`} className="inline-flex min-h-12 items-center self-start rounded-card bg-primary px-4 font-bold text-on-primary">
        {t('outfits.new')}
      </Link>

      <nav className="flex flex-wrap gap-3 text-sm font-bold">
        <Link href={`/${locale}/wardrobe/outfits?week=${isoDay(addDays(start, -7))}`} className="inline-flex min-h-11 items-center gap-1 text-primary">
          <Icon name="back" directional />
          {t('outfits.prev')}
        </Link>
        <Link href={`/${locale}/wardrobe/outfits`} className="inline-flex min-h-11 items-center text-primary">
          {t('outfits.thisWeek')}
        </Link>
        <Link href={`/${locale}/wardrobe/outfits?week=${isoDay(addDays(start, 7))}`} className="inline-flex min-h-11 items-center gap-1 text-primary">
          {t('outfits.next')}
          <Icon name="back" directional className="rotate-180" />
        </Link>
      </nav>

      {items.length === 0 && <p className="text-muted">{t('outfits.none')}</p>}

      <div className="flex flex-col gap-3">
        {days.map((day) => {
          const key = isoDay(day);
          const dayItems = byDay.get(key) ?? [];
          return (
            <section key={key} aria-labelledby={`day-${key}`} className="flex flex-col gap-2 border-t border-neutral-soft pt-3">
              <h2 id={`day-${key}`} className={SECTION + ' mt-0'}>
                {fmt(day, { weekday: 'long', day: 'numeric', month: 'long' })}
              </h2>
              {dayItems.length === 0 ? (
                <p className="text-sm text-muted">{t('outfits.empty')}</p>
              ) : (
                <ul role="list" className="flex flex-col gap-2">
                  {dayItems.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-2 rounded-card border border-neutral-soft bg-surface p-3">
                      <time dateTime={o.plannedFor} className="font-bold tabular-nums">
                        {fmt(new Date(o.plannedFor), { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </time>
                      <Link href={`/${locale}/wardrobe/outfits/${o.id}`} className="flex-1 font-bold text-primary underline underline-offset-[3px]">
                        {o.name ?? t('outfits.untitled')}
                      </Link>
                      {o.occasion && <span className="text-sm text-muted">{o.occasion}</span>}
                      <span className="rounded-full bg-neutral-soft px-3 py-1 text-sm font-medium">{t(`outfits.${o.status.toLowerCase()}`)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
