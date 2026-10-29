import { getMessage } from '@/i18n/messages';
import type { Locale } from '@/i18n/config';
import { AppNav } from './AppNav';

/** Bottom navigation of the signed-in screens (dressing, settings). Onboarding has none. */
export function MainNav({ locale }: { locale: Locale }) {
  return (
    <AppNav
      label={getMessage(locale, 'nav.label')}
      items={[
        { href: `/${locale}/dressing`, section: `/${locale}/dressing`, text: getMessage(locale, 'nav.dressing'), icon: 'shirt' },
        { href: `/${locale}/settings/profile`, section: `/${locale}/settings`, text: getMessage(locale, 'nav.settings'), icon: 'edit' },
      ]}
    />
  );
}
