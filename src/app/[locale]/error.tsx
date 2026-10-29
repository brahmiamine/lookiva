'use client';
import { useTranslations } from 'next-intl';
import { Button } from '@/ui/components/Button';
import { ErrorState } from '@/ui/components/ErrorState';

// Route error boundary. The error itself is deliberately never shown to the user. Messages come from the layout's
// client provider (only the `error` namespace), not from an import of every catalog.
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('error');
  return (
    <main className="p-4">
      <ErrorState
        title={t('title')}
        description={t('description')}
        action={
          <Button variant="primary" onClick={reset}>
            {t('retry')}
          </Button>
        }
      />
    </main>
  );
}
