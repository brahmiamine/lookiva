import { describe, expect, it } from 'vitest';
import { formatDate, formatNumber } from '@/i18n/format';

const NON_LATIN_DIGITS = /[٠-٩۰-۹]/;

describe('format', () => {
  it('formatNumber_ar_uses_only_latin_digits', () => {
    const s = formatNumber('ar', 1234.5);
    expect(s).toMatch(/[0-9]/);
    expect(s).not.toMatch(NON_LATIN_DIGITS);
  });
  it('formatDate_uses_the_given_timezone', () => {
    const d = new Date('2026-01-15T12:00:00Z');
    const paris = formatDate('fr', d, 'Europe/Paris');
    const ny = formatDate('fr', d, 'America/New_York');
    expect(paris).not.toBe(ny);
    expect(paris).toContain('13:00');
    expect(ny).toContain('07:00');
    expect(formatDate('ar', d, 'Europe/Paris')).not.toMatch(NON_LATIN_DIGITS);
  });
});
