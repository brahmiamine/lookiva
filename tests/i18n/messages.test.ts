import { describe, expect, it } from 'vitest';
import ar from '@/i18n/messages/ar.json';
import en from '@/i18n/messages/en.json';
import fr from '@/i18n/messages/fr.json';
import { getMessage } from '@/i18n/messages';

const keysOf = (o: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keysOf(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

describe('messages', () => {
  it('missing_key_in_en_falls_back_to_fr_value', () => {
    const catalog = { fr: { a: { b: 'valeur fr' } }, en: {}, ar: {} };
    expect(getMessage('en', 'a.b', catalog)).toBe('valeur fr');
  });
  it('unknown_key_returns_the_key', () => {
    expect(getMessage('ar', 'nope.nothing')).toBe('nope.nothing');
  });
  it('message_keys_are_identical_across_fr_en_ar', () => {
    const f = keysOf(fr).sort();
    expect(f.length).toBeGreaterThan(0);
    expect(keysOf(en).sort()).toEqual(f);
    expect(keysOf(ar).sort()).toEqual(f);
  });
});
