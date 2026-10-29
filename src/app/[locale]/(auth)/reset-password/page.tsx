import { pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { pageLocale, titleFrom } from '../../page-helpers';
import { ResetForm } from './ResetForm';

export const generateMetadata = titleFrom('auth.reset.title');

export default async function Page(props: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(props);
  return (
    <IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'auth'])}>
      <ResetForm />
    </IntlProvider>
  );
}
