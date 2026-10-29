import Link from 'next/link';
import { wardrobeRoutes } from '@/modules/wardrobe';
import { getMessage, pickMessages } from '@/i18n/messages';
import { Icon } from '@/ui/components/Icon';
import { IntlProvider } from '@/ui/components/IntlProvider';
import type { OutfitDetail } from '@/ui/wardrobe';
import { pageLocale, titleFrom } from '../../../../page-helpers';
import { getJson, requireAccount } from '../../../server-api';
import { H1, LEAD, SECTION } from '../../../styles';
import { OutfitActions } from './OutfitActions';

export const generateMetadata = titleFrom('wardrobe.outfits.title');

export default async function OutfitPage(props: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await props.params;
  const locale = await pageLocale(props);
  await requireAccount(locale, 'onboarded');
  const o = await getJson<OutfitDetail>((req) => wardrobeRoutes.getOutfit(req, id), `/outfits/${id}`, locale);
  const t = (key: string, values?: Record<string, string>) => getMessage(locale, `wardrobe.${key}`).replace(/\{(\w+)\}/g, (_, k) => values?.[k] ?? '');
  const fmt = (iso: string) => new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso));
  const isOpen = o.status === 'DRAFT' || o.status === 'PLANNED';

  return (
    <main className="flex flex-col gap-2 pb-8 font-sans">
      <Link href={`/${locale}/wardrobe/outfits`} className="mt-2 inline-flex min-h-11 items-center gap-2 self-start font-bold text-primary">
        <Icon name="back" directional />
        {t('outfits.link')}
      </Link>
      <h1 className={H1}>{o.name ?? t('outfits.untitled')}</h1>
      <p className={LEAD}>
        {t(`outfits.${o.status.toLowerCase()}`)}
        {o.plannedFor && ` · ${fmt(o.plannedFor)}`}
      </p>

      <h2 className={SECTION}>{t('outfits.pieces')}</h2>
      {o.items.length === 0 ? (
        <p className="text-sm text-muted">{t('outfits.noPieces')}</p>
      ) : (
        <ul role="list" className="flex flex-col gap-2">
          {o.items.map((i) => (
            <li key={i.garmentId}>
              <Link href={`/${locale}/wardrobe/${i.garmentId}`} className="flex min-h-11 items-center rounded-card border border-neutral-soft bg-surface px-3 font-bold text-primary">
                {i.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <IntlProvider locale={locale} messages={pickMessages(locale, ['common', 'wardrobe'])}>
        <OutfitActions outfit={o} open={isOpen} />
      </IntlProvider>
    </main>
  );
}
