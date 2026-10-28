import { createTranslator } from 'next-intl';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import { messagesFor } from '@/i18n/messages';

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator({ locale, messages: messagesFor(locale) });
  return (
    <main>
      <h1>{t('app.name')}</h1>
      <h2>{t('home.title')}</h2>
      <p>{t('home.subtitle')}</p>
    </main>
  );
}
