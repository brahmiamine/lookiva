import { pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { pageLocale, titleFrom } from '../../page-helpers';
import { ForgotForm } from './ForgotForm';

export const generateMetadata = titleFrom('auth.forgot.title');

export default async function Page(props: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(props);
  return (
    <IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'auth'])}>
      <ForgotForm />
    </IntlProvider>
  );
}
