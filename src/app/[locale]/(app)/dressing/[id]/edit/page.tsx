import { pageLocale, titleFrom } from '../../../../page-helpers';
import { requireAccount } from '../../../server-api';
import { FormPage } from '../../FormPage';
import { loadCatalog, loadGarment } from '../../server';

export const generateMetadata = titleFrom('wardrobe.form.editTitle');

export default async function EditGarmentPage(props: { params: Promise<{ locale: string; id: string }> }) {
  const locale = await pageLocale(props);
  await requireAccount(locale, 'onboarded');
  const { id } = await props.params;
  const [catalog, garment] = await Promise.all([loadCatalog(locale), loadGarment(locale, id)]);
  return <FormPage locale={locale} catalog={catalog} mode={{ kind: 'edit', garment }} backHref={`/${locale}/dressing/${id}`} />;
}
