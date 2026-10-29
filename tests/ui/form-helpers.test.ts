// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { looksLikeEmail, takeFragmentToken } from '@/ui/form-helpers';

describe('form helpers', () => {
  it('takes_the_fragment_token_and_strips_it_from_the_url', () => {
    history.replaceState(null, '', '/fr/verify-email#token=abc_DEF-123');
    expect(takeFragmentToken()).toBe('abc_DEF-123');
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('abc_DEF');
    expect(takeFragmentToken()).toBeNull();
  });
  it('rejects_a_fragment_without_a_token', () => {
    history.replaceState(null, '', '/fr/reset-password#nothing');
    expect(takeFragmentToken()).toBeNull();
    expect(window.location.hash).toBe('');
  });
  it('email_shape', () => {
    expect(looksLikeEmail(' a@b.co ')).toBe(true);
    expect(looksLikeEmail('a@b')).toBe(false);
  });
});
