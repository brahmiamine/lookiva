import { COMMON_PASSWORDS } from './common-passwords';
import { emailLocalPart, normalizeEmail } from './email';

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export type PasswordProblem = 'too_short' | 'too_long' | 'too_common' | 'matches_email';

/** Length in Unicode code points, no composition rules, small deny-list, not the email local part. */
export function checkPassword(password: string, email: string): PasswordProblem | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN) return 'too_short';
  if (length > PASSWORD_MAX) return 'too_long';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'too_common';
  if (lower === emailLocalPart(normalizeEmail(email))) return 'matches_email';
  return null;
}
