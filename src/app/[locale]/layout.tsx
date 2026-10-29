import '../globals.css';
import { createTranslator } from 'next-intl';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { DirectionRoot } from '@/ui/components/DirectionRoot';
import { HydrationMarker } from '@/ui/components/HydrationMarker';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { LOCALES, dirFor, isLocale } from '@/i18n/config';
import { messagesFor, pickMessages } from '@/i18n/messages';

export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));

/** Default document title (WCAG 2.4.2); pages set their own `title`, rendered through the template. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const name = createTranslator({ locale, messages: messagesFor(locale) })('app.name');
  return { title: { default: name, template: `%s · ${name}` } };
}

export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body>
        <HydrationMarker />
        {/* error.tsx and not-found.tsx are client components under this provider: only their namespaces ship. */}
        <IntlProvider locale={locale} messages={pickMessages(locale, ['app', 'error', 'notFound'])}>
          <DirectionRoot dir={dirFor(locale)}>{children}</DirectionRoot>
        </IntlProvider>
      </body>
    </html>
  );
}
