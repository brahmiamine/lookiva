import type { ReactNode } from 'react';
import { pageLocale } from '../../page-helpers';
import { MainNav } from '../nav';

// Session-bound pages: never prerender candidates (also keeps them out of next dev's prerender manifest, whose
// concurrent rewrites have corrupted it during parallel e2e runs).
export const dynamic = 'force-dynamic';

export default async function DressingLayout(props: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(props);
  return (
    <>
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 pb-44 font-sans text-text">{props.children}</div>
      <MainNav locale={locale} />
    </>
  );
}
