import { pageLocale, titleFrom } from '../../../page-helpers';
import { requireAccount } from '../../server-api';
import { FormPage } from '../FormPage';
import { loadCatalog, loadGarment } from '../server';

export const generateMetadata = titleFrom('wardrobe.form.createTitle');

/** New garment, or (with ?from=<id>) the duplication of an existing one, prefilled and editable. */
export default async function NewGarmentPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<{ from?: string }> }) {
  const locale = await pageLocale(props);
  await requireAccount(locale, 'onboarded');
  const { from } = await props.searchParams;
  const [catalog, source] = await Promise.all([loadCatalog(locale), typeof from === 'string' ? loadGarment(locale, from) : null]);
  return (
    <FormPage
      locale={locale}
      catalog={catalog}
      mode={source ? { kind: 'duplicate', source } : { kind: 'create' }}
      backHref={source ? `/${locale}/dressing/${source.id}` : `/${locale}/dressing`}
    />
  );
}
