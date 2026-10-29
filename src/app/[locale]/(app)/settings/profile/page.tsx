import { identityRoutes } from '@/modules/identity';
import { getMessage, pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { pageLocale, titleFrom } from '../../../page-helpers';
import { getJson, requireAccount, timeZones } from '../../server-api';
import { SettingsHeader } from '../SettingsHeader';
import { Profile } from './Profile';

export const generateMetadata = titleFrom('settings.profile.title');

export default async function ProfilePage(props: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(props);
  const { prefs, etag } = await requireAccount(locale, 'onboarded');
  const exports = await getJson<{ items: { requestedAt: string }[] }>(identityRoutes.listExportRequests, '/me/export-requests?limit=1', locale);
  return (
    <>
      <SettingsHeader title={getMessage(locale, 'settings.title')} backLabel={getMessage(locale, 'settings.back')} />
      <main>
        <IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'settings'])}>
          <Profile initial={prefs} etag={etag} timeZones={timeZones()} pendingExportAt={exports.items[0]?.requestedAt ?? null} />
        </IntlProvider>
      </main>
    </>
  );
}
