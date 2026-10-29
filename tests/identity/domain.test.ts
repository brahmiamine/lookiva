import { describe, expect, it } from 'vitest';
import { COMMON_PASSWORDS } from '@/modules/identity/domain/common-passwords';
import { normalizeEmail } from '@/modules/identity/domain/email';
import { checkPassword } from '@/modules/identity/domain/password-policy';
import {
  RESEND_COOLDOWN_MS,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  SESSION_TOUCH_MS,
  TOKEN_TTL_MS,
  cooldownLeftMs,
  sessionIsActive,
  sessionNeedsTouch,
} from '@/modules/identity/domain/policy';
import { isIanaTimeZone } from '@/modules/identity/domain/preferences';

const DAY = 86_400_000;

describe('normalizeEmail', () => {
  it('trims_lowercases_and_applies_nfkc', () => {
    expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com');
    // fullwidth letters and a ligature fold to their ASCII form under NFKC
    expect(normalizeEmail('ＡＬＩＣＥ@example.com')).toBe('alice@example.com');
    expect(normalizeEmail('ﬁona@example.com')).toBe('fiona@example.com');
  });

  it('composed_and_decomposed_accents_normalise_to_the_same_value', () => {
    expect(normalizeEmail('Élodie@example.com')).toBe(normalizeEmail('Élodie@example.com'));
  });
});

describe('checkPassword', () => {
  const email = 'jeanne.doe@example.com';

  it('accepts_12_to_128_code_points_without_composition_rules', () => {
    expect(checkPassword('correct horse battery', email)).toBeNull();
    expect(checkPassword('a'.repeat(5) + 'bcdefgh', email)).toBeNull(); // 12, no digits/symbols needed
    expect(checkPassword('é'.repeat(128), email)).toBeNull();
  });

  it('counts_unicode_code_points_not_utf16_units', () => {
    // 11 emoji = 22 UTF-16 units but 11 code points: too short
    expect(checkPassword('😀'.repeat(11), email)).toBe('too_short');
    expect(checkPassword('😀'.repeat(12), email)).toBeNull();
    expect(checkPassword('😀'.repeat(129), email)).toBe('too_long');
  });

  it('rejects_too_short_and_too_long', () => {
    expect(checkPassword('x'.repeat(11), email)).toBe('too_short');
    expect(checkPassword('x'.repeat(129), email)).toBe('too_long');
  });

  it('rejects_common_passwords_case_insensitively', () => {
    expect(checkPassword('Password1234', email)).toBe('too_common');
    expect(checkPassword('QWERTYUIOP123', email)).toBe('too_common');
  });

  it('rejects_the_email_local_part', () => {
    expect(checkPassword('Jeanne.Doe.Example', 'jeanne.doe.example@x.test')).toBe('matches_email');
  });

  it('bundles_at_least_100_lowercase_common_passwords', () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThanOrEqual(100);
    for (const p of COMMON_PASSWORDS) expect(p).toBe(p.toLowerCase());
  });
});

describe('session and token policy', () => {
  const t0 = new Date('2026-03-01T00:00:00Z');
  const at = (ms: number) => new Date(t0.getTime() + ms);
  const session = { createdAt: t0, lastSeenAt: t0, expiresAt: at(SESSION_ABSOLUTE_MS), revokedAt: null };

  it('constants_match_the_ruling', () => {
    expect(SESSION_IDLE_MS).toBe(30 * DAY);
    expect(SESSION_ABSOLUTE_MS).toBe(90 * DAY);
    expect(SESSION_TOUCH_MS).toBe(5 * 60_000);
    expect(TOKEN_TTL_MS).toEqual({ VERIFY_EMAIL: DAY, RESET_PASSWORD: 3_600_000 });
    expect(RESEND_COOLDOWN_MS).toBe(60_000);
  });

  it('session_is_active_until_idle_timeout', () => {
    expect(sessionIsActive(session, at(30 * DAY - 1))).toBe(true);
    expect(sessionIsActive(session, at(30 * DAY))).toBe(false);
  });

  it('activity_slides_the_idle_window_but_not_the_absolute_lifetime', () => {
    const recent = { ...session, lastSeenAt: at(89 * DAY) };
    expect(sessionIsActive(recent, at(90 * DAY - 1))).toBe(true);
    expect(sessionIsActive(recent, at(90 * DAY))).toBe(false);
  });

  it('revoked_session_is_never_active', () => {
    expect(sessionIsActive({ ...session, revokedAt: t0 }, at(1))).toBe(false);
  });

  it('last_seen_is_touched_at_most_every_5_minutes', () => {
    expect(sessionNeedsTouch(session, at(SESSION_TOUCH_MS - 1))).toBe(false);
    expect(sessionNeedsTouch(session, at(SESSION_TOUCH_MS))).toBe(true);
  });

  it('cooldown_left_counts_down_from_the_last_send', () => {
    expect(cooldownLeftMs(null, t0)).toBe(0);
    expect(cooldownLeftMs(t0, at(10_000))).toBe(50_000);
    expect(cooldownLeftMs(t0, at(60_000))).toBe(0);
  });
});

describe('isIanaTimeZone', () => {
  it('accepts_canonical_zones_utc_and_known_aliases', () => {
    for (const tz of ['Europe/Paris', 'Africa/Casablanca', 'America/Argentina/Buenos_Aires', 'UTC', 'Europe/Kiev']) {
      expect(isIanaTimeZone(tz), tz).toBe(true);
    }
  });

  it('rejects_offsets_garbage_and_unknown_zones', () => {
    for (const tz of ['+01:00', 'Mars/Olympus', '', 'europe/paris ', 'Europe/Paris\n', '../../etc/passwd']) {
      expect(isIanaTimeZone(tz), JSON.stringify(tz)).toBe(false);
    }
  });
});
