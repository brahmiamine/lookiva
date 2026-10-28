import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/ui/contrast';

const css = readFileSync(new URL('../../src/ui/tokens.css', import.meta.url), 'utf8');

function token(name: string): string {
  const m = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`token --${name} missing`);
  return m[1]!.trim();
}
const hex = (name: string) => token(name);

const TONES = ['success', 'warning', 'danger', 'info', 'neutral'] as const;

describe('contrastRatio', () => {
  it('contrastRatio_black_on_white_is_21', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });
  it('contrastRatio_is_symmetric', () => {
    expect(contrastRatio('#0E5C63', '#f4f6f8')).toBeCloseTo(contrastRatio('#F4F6F8', '#0e5c63'), 10);
  });
  it('contrastRatio_rejects_malformed_hex', () => {
    for (const bad of ['', '000000', '#fff', '#GGGGGG', '#0000000', 'red']) {
      expect(() => contrastRatio(bad, '#FFFFFF')).toThrow();
      expect(() => contrastRatio('#FFFFFF', bad)).toThrow();
    }
  });
});

describe('design tokens', () => {
  it('tokens_define_all_required_variables', () => {
    const names = [
      'color-bg', 'color-surface', 'color-text', 'color-text-muted',
      'color-primary', 'color-on-primary', 'color-border',
      ...TONES.flatMap((t) => [`color-tone-${t}-fg`, `color-tone-${t}-bg`]),
      'font-sans', 'radius-card', 'size-touch',
    ];
    for (const n of names) expect(() => token(n), n).not.toThrow();
    for (const n of names.filter((x) => x.startsWith('color-'))) expect(hex(n), n).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(token('radius-card')).toBe('12px');
    expect(token('size-touch')).toBe('44px');
  });

  it('primary_bg_text_values_match_the_spec', () => {
    expect(hex('color-primary').toUpperCase()).toBe('#0E5C63');
    expect(hex('color-bg').toUpperCase()).toBe('#F4F6F8');
    expect(hex('color-text').toUpperCase()).toBe('#14202B');
  });

  it('text_pairs_meet_4_5', () => {
    const pairs: [string, string][] = [
      ['color-text', 'color-bg'],
      ['color-text', 'color-surface'],
      ['color-text-muted', 'color-bg'],
      ['color-text-muted', 'color-surface'],
      ['color-on-primary', 'color-primary'],
      ['color-primary', 'color-surface'],
      ...TONES.map((t): [string, string] => [`color-tone-${t}-fg`, `color-tone-${t}-bg`]),
    ];
    for (const [fg, bg] of pairs) {
      expect(contrastRatio(hex(fg), hex(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('border_meets_3_on_surface_and_bg', () => {
    expect(contrastRatio(hex('color-border'), hex('color-surface'))).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(hex('color-border'), hex('color-bg'))).toBeGreaterThanOrEqual(3);
  });

  it('font_sans_token_defines_arabic_fallback', () => {
    expect(token('font-sans')).toContain('Noto Sans Arabic');
  });
});
