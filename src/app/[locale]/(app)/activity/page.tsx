import { pageLocale, titleFrom } from '../../page-helpers';
import { requireAccount } from '../server-api';
import { pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { Activity } from './Activity';
export const generateMetadata = titleFrom('activity.title');
export default async function Page(props: {
    params: Promise<{
        locale: string;
    }>;
}) { const locale = await pageLocale(props); await requireAccount(locale, 'onboarded'); return <IntlProvider locale={locale} messages={pickMessages(locale, ['activity'])}><Activity today={new Date().toISOString().slice(0, 10)}/></IntlProvider>; }
