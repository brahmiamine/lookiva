'use client';
import { useParams } from 'next/navigation';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';
import { getMessage } from '@/i18n/messages';
import { Button } from '@/ui/components/Button';
import { ErrorState } from '@/ui/components/ErrorState';

// Route error boundary. The error itself is deliberately never shown to the user.
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const raw = useParams<{ locale?: string }>().locale;
  const locale = typeof raw === 'string' && isLocale(raw) ? raw : DEFAULT_LOCALE;
  return (
    <main className="p-4">
      <ErrorState
        title={getMessage(locale, 'error.title')}
        description={getMessage(locale, 'error.description')}
        action={
          <Button variant="primary" onClick={reset}>
            {getMessage(locale, 'error.retry')}
          </Button>
        }
      />
    </main>
  );
}
