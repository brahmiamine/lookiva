import { pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { pageLocale, titleFrom } from '../../page-helpers';
import { LoginForm } from './LoginForm';

export const generateMetadata = titleFrom('auth.login.title');

export default async function LoginPage(props: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(props);
  return (
    <IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'auth'])}>
      <LoginForm />
    </IntlProvider>
  );
}
