'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

export default function NotFound() {
  const t = useTranslations('notFound');
  const locale = useLocale();
  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-3 p-4 font-sans text-text">
      <title>{t('title')}</title>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted">{t('description')}</p>
      <Link href={`/${locale}`} className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-4">
        {t('home')}
      </Link>
    </main>
  );
}
