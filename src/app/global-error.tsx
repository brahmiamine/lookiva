'use client';
import { useParams } from 'next/navigation';
import { DEFAULT_LOCALE, dirFor, isLocale } from '@/i18n/config';
import { getMessage } from '@/i18n/messages';

// Replaces the root layout when the layout itself fails, so no provider is available: it reads the catalogs directly.
// ponytail: this one chunk carries all three catalogs; it only loads on a fatal error. Split per locale if they grow.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const raw = useParams<{ locale?: string }>()?.locale;
  const locale = typeof raw === 'string' && isLocale(raw) ? raw : DEFAULT_LOCALE;
  const t = (key: string) => getMessage(locale, key);
  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
        <title>{t('error.title')}</title>
        <main role="alert">
          <h1>{t('error.title')}</h1>
          <p>{t('error.description')}</p>
          <button type="button" onClick={reset} style={{ minBlockSize: 44, minInlineSize: 44 }}>
            {t('error.retry')}
          </button>
        </main>
      </body>
    </html>
  );
}
