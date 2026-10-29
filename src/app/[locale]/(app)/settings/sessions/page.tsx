import { identityRoutes } from '@/modules/identity';
import { getMessage, pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { pageLocale, titleFrom } from '../../../page-helpers';
import { getJson, requireAccount } from '../../server-api';
import { SettingsHeader } from '../SettingsHeader';
import { Sessions, type SessionItem } from './Sessions';

export const generateMetadata = titleFrom('settings.sessions.title');

export default async function SessionsPage(props: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(props);
  await requireAccount(locale, 'onboarded');
  // ponytail: first 100 sessions only (API max page); add "show more" with nextCursor if anyone ever has more.
  const { items } = await getJson<{ items: SessionItem[] }>(identityRoutes.listSessions, '/me/sessions?limit=100', locale);
  return (
    <>
      <SettingsHeader title={getMessage(locale, 'settings.title')} backHref={`/${locale}/settings/profile`} backLabel={getMessage(locale, 'settings.back')} />
      <main>
        <IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'settings'])}>
          <Sessions initial={items} />
        </IntlProvider>
      </main>
    </>
  );
}
