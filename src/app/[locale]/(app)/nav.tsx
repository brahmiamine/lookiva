import { getMessage } from '@/i18n/messages';
import type { Locale } from '@/i18n/config';
import { AppNav } from './AppNav';

/** Bottom navigation of the signed-in screens (dressing, outfits, settings). Onboarding has none. */
export function MainNav({ locale }: { locale: Locale }) {
  return (
    <AppNav
      label={getMessage(locale, 'nav.label')}
      items={[
        { href: `/${locale}/dressing`, section: `/${locale}/dressing`, text: getMessage(locale, 'nav.dressing'), icon: 'shirt' },
        { href: `/${locale}/recherche`, section: `/${locale}/recherche`, text: getMessage(locale, 'nav.search'), icon: 'search' },
        { href: `/${locale}/tenues`, section: `/${locale}/tenues`, text: getMessage(locale, 'nav.outfits'), icon: 'calendar' },
        { href: `/${locale}/planning`, section: `/${locale}/planning`, text: getMessage(locale, 'planning.title'), icon: 'calendar' },
        { href: `/${locale}/activity`, section: `/${locale}/activity`, text: getMessage(locale, 'activity.title'), icon: 'info' },
        { href: `/${locale}/settings/profile`, section: `/${locale}/settings`, text: getMessage(locale, 'nav.settings'), icon: 'edit' },
      ]}
    />
  );
}
