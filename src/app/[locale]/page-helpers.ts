import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '@/i18n/config';
import { getMessage } from '@/i18n/messages';

type Params = { params: Promise<{ locale: string }> };

export async function pageLocale({ params }: Params): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}

/** generateMetadata for a page whose title is one message key (rendered through the layout's "%s · Lookiva"). */
export const titleFrom =
  (key: string) =>
  async (props: Params): Promise<Metadata> => ({ title: getMessage(await pageLocale(props), key) });
