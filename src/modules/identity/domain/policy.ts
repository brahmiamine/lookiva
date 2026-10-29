// Every identity duration lives here (owner rulings, Phase 03).
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Sliding idle timeout: a session unused for this long is dead. */
export const SESSION_IDLE_MS = 30 * DAY;
/** Absolute lifetime from login, whatever the activity. */
export const SESSION_ABSOLUTE_MS = 90 * DAY;
/** lastSeenAt is written at most this often (limits writes on every request). */
export const SESSION_TOUCH_MS = 5 * MINUTE;
export const TOKEN_TTL_MS = { VERIFY_EMAIL: DAY, RESET_PASSWORD: HOUR } as const;
/** Minimum delay between two emails of the same purpose to the same account. */
export const RESEND_COOLDOWN_MS = MINUTE;

export type TokenPurpose = keyof typeof TOKEN_TTL_MS;

type SessionTimes = { lastSeenAt: Date; expiresAt: Date; revokedAt: Date | null };

export const sessionIsActive = (s: SessionTimes, now: Date): boolean =>
  s.revokedAt === null && now < s.expiresAt && now.getTime() - s.lastSeenAt.getTime() < SESSION_IDLE_MS;

export const sessionNeedsTouch = (s: { lastSeenAt: Date }, now: Date): boolean =>
  now.getTime() - s.lastSeenAt.getTime() >= SESSION_TOUCH_MS;

export const cooldownLeftMs = (lastSentAt: Date | null, now: Date): number =>
  lastSentAt === null ? 0 : Math.max(0, lastSentAt.getTime() + RESEND_COOLDOWN_MS - now.getTime());
