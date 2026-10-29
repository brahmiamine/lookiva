'use client';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useState } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { Button } from '@/ui/components/Button';

/** Restores one garment; the page is re-read from the server, so the row leaves the list once it is back. */
export function RestoreButton({ id, label }: { id: string; label: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function restore() {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/garments/${id}/restore`, { method: 'POST' });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return router.replace(`/${locale}/login`);
      setBusy(false); // ponytail: a failed restore just re-enables the button; no notice yet.
    }
  }

  return (
    <Button variant="outline" className="min-h-11" onClick={restore} aria-disabled={busy || undefined}>
      {label}
    </Button>
  );
}
