import Link from 'next/link';
import { wardrobeRoutes } from '@/modules/wardrobe';
import { getMessage, pickMessages } from '@/i18n/messages';
import { Icon } from '@/ui/components/Icon';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { GarmentStatusBadge } from '@/ui/components/GarmentStatusBadge';
import { labelOf, garmentName, type Garment, type Photo } from '@/ui/wardrobe';
import { pageLocale, titleFrom } from '../../../page-helpers';
import { getJson, getJsonWithEtag, requireAccount } from '../../server-api';
import { loadCatalog } from '../catalog';
import { H1, LEAD, SECTION } from '../../styles';
import { GarmentActions } from './GarmentActions';
import { GarmentEditor } from './GarmentEditor';
import { Photos } from './Photos';

export const generateMetadata = titleFrom('wardrobe.title');

export default async function GarmentPage(props: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await props.params;
  const locale = await pageLocale(props);
  await requireAccount(locale, 'onboarded');
  const [catalog, { data: garment, etag }, photos] = await Promise.all([
    loadCatalog(locale),
    getJsonWithEtag<Garment>((req) => wardrobeRoutes.getGarment(req, id), `/garments/${id}`, locale),
    getJson<{ items: Photo[] }>((req) => wardrobeRoutes.listPhotos(req, id), `/garments/${id}/photos`, locale),
  ]);

  const category = catalog.categories.find((c) => c.code === garment.categoryCode);
  const subtype = category?.subtypes.find((s) => s.code === garment.subtypeCode);
  const colorLabel = (code: string) => labelOf(catalog.colors.find((c) => c.code === code)?.labels, locale);
  const list = (codes: string[], all: { code: string; labels: Record<'fr' | 'en' | 'ar', string> }[]) =>
    codes.map((code) => labelOf(all.find((x) => x.code === code)?.labels, locale)).join(', ');
  const t = (key: string) => getMessage(locale, `wardrobe.${key}`);
  const weatherFields = ['warmth', 'rain', 'windproof', 'breathability', 'layering'] as const;
  const weatherLabels = {
    field: Object.fromEntries(weatherFields.map((k) => [k, t(`weather.field.${k}`)])),
    value: Object.fromEntries(weatherFields.map((k) => [k, Object.fromEntries((catalog.weather[k] ?? []).map((code) => [code, t(`weather.value.${k}.${code}`)]))])),
  };
  const statusLabel = labelOf(catalog.statuses.find((s) => s.code === garment.status)?.labels, locale);

  return (
    <main className="flex flex-col gap-2 pb-8 font-sans">
      <Link href={`/${locale}/wardrobe`} className="mt-2 inline-flex min-h-11 items-center gap-2 self-start font-bold text-primary">
        <Icon name="back" directional />
        {t('back')}
      </Link>
      <h1 className={H1}>{garmentName(garment, catalog, locale)}</h1>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <GarmentStatusBadge status={garment.status} label={statusLabel} />
        <p className={LEAD + ' mb-0'}>{t(garment.recommendable ? 'detail.recommendable' : 'detail.notRecommendable')}</p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
        <dt className="font-bold text-muted">{t('new.category')}</dt>
        <dd>{labelOf(category?.labels, locale)}</dd>
        <dt className="font-bold text-muted">{t('new.subtype')}</dt>
        <dd>{garment.customSubcategory?.label ?? labelOf(subtype?.labels, locale)}</dd>
        <dt className="font-bold text-muted">{t('new.color')}</dt>
        <dd>{colorLabel(garment.primaryColor.code)}</dd>
        {garment.seasons.length > 0 && (
          <>
            <dt className="font-bold text-muted">{t('new.seasons')}</dt>
            <dd>{list(garment.seasons, catalog.seasons)}</dd>
          </>
        )}
        {garment.styles.length > 0 && (
          <>
            <dt className="font-bold text-muted">{t('new.styles')}</dt>
            <dd>{list(garment.styles, catalog.styles)}</dd>
          </>
        )}
        {garment.notes && (
          <>
            <dt className="font-bold text-muted">{t('new.notes')}</dt>
            <dd className="whitespace-pre-line">{garment.notes}</dd>
          </>
        )}
      </dl>

      <IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'wardrobe'])}>
        <h2 className={SECTION}>{t('detail.status')}</h2>
        <GarmentActions garment={garment} etag={etag} statuses={catalog.statuses} />

        <h2 className={SECTION}>{t('edit.title')}</h2>
        <GarmentEditor garment={garment} etag={etag} weather={catalog.weather} weatherLabels={weatherLabels} />

        <h2 className={SECTION}>{t('detail.photos')}</h2>
        <Photos garmentId={garment.id} initial={photos.items} />
      </IntlProvider>
    </main>
  );
}
