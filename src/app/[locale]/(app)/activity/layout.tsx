import type { ReactNode } from 'react';
import { pageLocale } from '../../page-helpers';
import { MainNav } from '../nav';
// Session-bound pages: never prerendered (same reason as the dressing layout).
export const dynamic = 'force-dynamic';
export default async function SearchLayout(props: {
    children: ReactNode;
    params: Promise<{
        locale: string;
    }>;
}) {
    const locale = await pageLocale(props);
    return (<>
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pb-32 font-sans text-text">{props.children}</div>
      <MainNav locale={locale}/>
    </>);
}
