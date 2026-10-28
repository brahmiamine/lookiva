import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { LOCALES, dirFor, isLocale } from '@/i18n/config';

export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));

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
      <body>{children}</body>
    </html>
  );
}
