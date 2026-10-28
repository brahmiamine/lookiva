import { describe, expect, it } from 'vitest';
import { resolveLocale } from '@/i18n/routing';

describe('resolveLocale', () => {
  it('unknown_locale_is_replaced_with_fr', () => {
    expect(resolveLocale('/de/dressing')).toEqual({ locale: 'fr', redirectTo: '/fr/dressing' });
  });
  it('missing_locale_prefix_is_added', () => {
    expect(resolveLocale('/dressing')).toEqual({ locale: 'fr', redirectTo: '/fr/dressing' });
    expect(resolveLocale('/')).toEqual({ locale: 'fr', redirectTo: '/fr' });
  });
  it('supported_locale_has_no_redirect', () => {
    expect(resolveLocale('/ar/dressing')).toEqual({ locale: 'ar' });
    expect(resolveLocale('/en')).toEqual({ locale: 'en' });
  });
  it('region_locale_is_replaced', () => {
    expect(resolveLocale('/en-US/x')).toEqual({ locale: 'fr', redirectTo: '/fr/x' });
  });
  it('locale_only_unknown_is_replaced', () => {
    expect(resolveLocale('/de')).toEqual({ locale: 'fr', redirectTo: '/fr' });
  });
});
