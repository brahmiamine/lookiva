'use client';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import type { ReactNode } from 'react';

// Client-side provider (plain next-intl client build: no request config needed). Server components pass ONLY the
// namespaces their client children use (`pickMessages`), so a page never ships every catalog to the browser.
// The time zone is fixed so server and client render identical text; dates that matter pass their own zone.
export function IntlProvider({ locale, messages, children }: { locale: string; messages: AbstractIntlMessages; children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}
