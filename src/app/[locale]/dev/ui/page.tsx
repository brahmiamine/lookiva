import { createTranslator } from 'next-intl';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import { formatNumber } from '@/i18n/format';
import { messagesFor } from '@/i18n/messages';
import { Bdi } from '@/ui/components/Bdi';
import { Button } from '@/ui/components/Button';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { Gallery } from '@/ui/components/Gallery';
import { GarmentCard } from '@/ui/components/GarmentCard';
import { LoadingState } from '@/ui/components/LoadingState';
import { OutfitCard } from '@/ui/components/OutfitCard';
import { StatusBadge } from '@/ui/components/StatusBadge';
import { TextField } from '@/ui/components/TextField';
import { DevUiDemo } from './DevUiDemo';

// Internal showcase: 404 in production builds.
export const dynamic = 'force-dynamic';

// Sample garments are user-style data: deliberately not translated.
const photo = (fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 40"><rect width="50" height="40" fill="${fill}"/></svg>`,
  )}`;
const GARMENTS = [
  { name: 'Trench camel', photoUrl: photo('#C9A67A'), tone: 'success' },
  { name: 'Chemise lin écru', tone: 'warning' },
  { name: 'Jean brut', photoUrl: photo('#3E5C85'), tone: 'info' },
  { name: 'Baskets blanches', tone: 'neutral' },
  { name: 'Robe midi noire', photoUrl: photo('#2B2F36'), tone: 'danger' },
  { name: 'Blazer laine', tone: 'success' },
] as const;
const TONES = [
  ['success', 'clean', '✓'],
  ['warning', 'dirty', '!'],
  ['danger', 'lost', '✕'],
  ['info', 'lent', '→'],
  ['neutral', 'archived', '–'],
] as const;
const ARABIC_SENTENCE = 'يمكنك مراسلتي على sara.ali@example.com غدًا صباحًا.';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: createTranslator({ locale, messages: messagesFor(locale) })('dev.ui.title') };
}

export default async function DevUiPage({ params }: { params: Promise<{ locale: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator({ locale, messages: messagesFor(locale) });
  const badge = (tone: (typeof TONES)[number][0]) => {
    const [, key, icon] = TONES.find(([x]) => x === tone) ?? TONES[4];
    return <StatusBadge tone={tone} label={t(`dev.ui.status.${key}`)} icon={icon} />;
  };
  const pieces = (count: number) => t('dev.ui.pieces', { count, n: formatNumber(locale, count) });
  const now = new Date();
  const h2 = 'text-lg font-semibold';

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-4 font-sans text-text">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('dev.ui.title')}</h1>
        <p className="text-muted">{t('dev.ui.intro')}</p>
      </header>

      <section className="flex flex-col items-start gap-3">
        <h2 className={h2}>{t('dev.ui.sections.buttons')}</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">{t('dev.ui.buttons.primary')}</Button>
          <Button variant="secondary">{t('dev.ui.buttons.secondary')}</Button>
          <Button variant="primary" disabled>
            {t('dev.ui.buttons.disabled')}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={h2}>{t('dev.ui.sections.fields')}</h2>
        <TextField label={t('dev.ui.fields.label')} />
        <TextField label={t('dev.ui.fields.errorLabel')} type="email" error={t('dev.ui.fields.error')} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={h2}>{t('dev.ui.sections.badges')}</h2>
        <div className="flex flex-wrap gap-2">{TONES.map(([tone]) => <span key={tone}>{badge(tone)}</span>)}</div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={h2}>{t('dev.ui.sections.bdi')}</h2>
        <p>
          <Bdi>{ARABIC_SENTENCE}</Bdi>
        </p>
        <p>
          <Bdi>sara.ali@example.com</Bdi>
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={h2}>{t('dev.ui.sections.states')}</h2>
        <EmptyState title={t('dev.ui.states.emptyTitle')} description={t('dev.ui.states.emptyDescription')} />
        <ErrorState title={t('dev.ui.states.errorTitle')} description={t('dev.ui.states.errorDescription')} />
        <LoadingState title={t('dev.ui.states.loadingTitle')} description={t('dev.ui.states.loadingDescription')} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={h2}>{t('dev.ui.sections.gallery')}</h2>
        <div data-testid="garment-gallery">
          <Gallery>
            {GARMENTS.map((g) => (
              <GarmentCard
                key={g.name}
                name={g.name}
                photoUrl={'photoUrl' in g ? g.photoUrl : undefined}
                badge={badge(g.tone)}
              />
            ))}
          </Gallery>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={h2}>{t('dev.ui.sections.outfits')}</h2>
        <Gallery>
          <OutfitCard title="Look bureau" occasion="Travail" pieceCount={4} pieceCountLabel={pieces(4)} badge={badge('success')} />
          <OutfitCard title="Robe du soir" pieceCount={1} pieceCountLabel={pieces(1)} />
        </Gallery>
      </section>

      <DevUiDemo
        locale={locale}
        year={now.getUTCFullYear()}
        month={now.getUTCMonth() + 1}
        labels={{
          calendarTitle: t('dev.ui.sections.calendar'),
          calendarNone: t('dev.ui.calendar.none'),
          calendarSelectedPrefix: t('dev.ui.calendar.selectedPrefix'),
          dialogTitle: t('dev.ui.sections.dialog'),
          dialogOpen: t('dev.ui.dialog.open'),
          dialogBody: t('dev.ui.dialog.body'),
          dialogClose: t('dev.ui.dialog.close'),
        }}
      />
    </main>
  );
}
