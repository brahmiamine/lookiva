import { pageLocale, titleFrom } from '../../page-helpers';
import { requireAccount } from '../server-api';
import { pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { Planner } from './Planner';
export const generateMetadata = titleFrom('planning.title');
export default async function Page(props: {
    params: Promise<{
        locale: string;
    }>;
}) { const locale = await pageLocale(props); const { prefs } = await requireAccount(locale, 'onboarded'); const timezone = prefs.timezone ?? 'UTC'; const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const part = (k: string) => parts.find(p => p.type === k)!.value; return <IntlProvider locale={locale} messages={pickMessages(locale, ['planning'])}><Planner timezone={timezone} today={`${part('year')}-${part('month')}-${part('day')}`}/></IntlProvider>; }
