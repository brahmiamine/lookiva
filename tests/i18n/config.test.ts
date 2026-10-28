import { describe, expect, it } from 'vitest';
import { dirFor } from '@/i18n/config';

describe('i18n config', () => {
  it('dirFor_ar_is_rtl_and_fr_en_are_ltr', () => {
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('fr')).toBe('ltr');
    expect(dirFor('en')).toBe('ltr');
  });
});
