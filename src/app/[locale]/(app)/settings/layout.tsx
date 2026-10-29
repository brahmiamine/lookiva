import type { ReactNode } from 'react';
import { pageLocale } from '../../page-helpers';
import { MainNav } from '../nav';

export default async function SettingsLayout(props: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(props);
  return (
    <>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-24 font-sans text-text">{props.children}</div>
      <MainNav locale={locale} />
    </>
  );
}
