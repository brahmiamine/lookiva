import type { ReactNode } from 'react';
import { getMessage } from '@/i18n/messages';
import { pageLocale } from '../page-helpers';

// Frame of the auth mockups: brand line, then one narrow column (mobile first, centred on wider screens).
export default async function AuthLayout(props: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(props);
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-6 font-sans text-text">
      <header className="pt-5 pb-1">
        <p className="text-2xl font-extrabold tracking-tight text-primary">{getMessage(locale, 'app.name')}</p>
      </header>
      <main className="flex flex-col">{props.children}</main>
    </div>
  );
}
