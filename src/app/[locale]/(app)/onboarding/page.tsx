import { pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { pageLocale, titleFrom } from '../../page-helpers';
import { requireAccount, timeZones } from '../server-api';
import { Onboarding } from './Onboarding';

export const generateMetadata = titleFrom('onboarding.title');

export default async function OnboardingPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const locale = await pageLocale(props);
  const { prefs } = await requireAccount(locale, 'onboarding');
  const { step } = await props.searchParams;
  return (
    <IntlProvider locale={locale} messages={pickMessages(locale, ['app', 'common', 'onboarding'])}>
      <Onboarding initialStep={step === 'city' ? 2 : 1} timeZones={timeZones()} savedTimeZone={prefs.timezone} />
    </IntlProvider>
  );
}
