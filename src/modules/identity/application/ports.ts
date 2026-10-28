import type { OwnerId, Page } from '@/platform/kernel';
import type { TokenPurpose } from '../domain/policy';
import type { Locale, ThermalSensitivity } from '../domain/preferences';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** `encoded === null` (unknown user) still runs a full hash so timing does not reveal the account. */
  verify(password: string, encoded: string | null): Promise<boolean>;
  needsRehash(encoded: string): boolean;
}

/** Opaque one-time/session tokens: only `hash` (SHA-256 hex) is ever stored. */
export interface TokenGenerator {
  generate(): { token: string; hash: string };
  hash(token: string): string;
}

export type UserStatus = 'ACTIVE' | 'DISABLED' | 'DELETION_REQUESTED';
export type UserRecord = {
  id: string;
  email: string;
  emailNormalized: string;
  emailVerifiedAt: Date | null;
  status: UserStatus;
  createdAt: Date;
};
export type SessionRecord = {
  id: string;
  userId: string;
  userAgent: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};
export type Preferences = {
  locale: Locale;
  cityName: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  aiEnabled: boolean;
  learningEnabled: boolean;
  thermalSensitivity: ThermalSensitivity;
  onboardingCompletedAt: Date | null;
  version: number;
};
export type PreferencesPatch = Partial<Omit<Preferences, 'version'>>;
export type ConsentKind = 'AI' | 'LEARNING';

/**
 * Persistence port of the identity module. Methods on a user's own data take the OwnerId first; the few lookups by
 * email or token hash happen before any session exists.
 */
export interface IdentityStore {
  findUserByEmail(normalized: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  /** User + credential + default preferences in one transaction; false when the normalised email is taken. */
  createUser(u: { id: string; email: string; emailNormalized: string; passwordHash: string; locale: Locale; now: Date }): Promise<boolean>;
  getPasswordHash(userId: string): Promise<string | null>;
  setPasswordHash(userId: string, passwordHash: string, now: Date): Promise<void>;

  lastTokenAt(userId: string, purpose: TokenPurpose): Promise<Date | null>;
  /** Stores a new token and voids the user's older unused tokens of the same purpose. */
  issueToken(t: { userId: string; purpose: TokenPurpose; tokenHash: string; now: Date; expiresAt: Date }): Promise<void>;
  findLiveToken(tokenHash: string, purpose: TokenPurpose, now: Date): Promise<{ userId: string } | null>;
  /** Atomic single use (`usedAt IS NULL` guard) + marks the email verified. Returns the user id, or null. */
  consumeVerifyToken(tokenHash: string, now: Date): Promise<string | null>;
  /** Atomic single use + new password + every session revoked + email verified, in one transaction. */
  consumeResetToken(tokenHash: string, now: Date, passwordHash: string): Promise<string | null>;

  createSession(s: { id: string; userId: string; tokenHash: string; userAgent: string; now: Date; expiresAt: Date }): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  touchSession(id: string, now: Date): Promise<void>;
  /** Live sessions (not revoked, lastSeenAt >= activeSince, expiresAt > now), newest first, cursor on id. */
  listSessions(ownerId: OwnerId, q: { activeSince: Date; now: Date; limit: number; cursor?: { id: string } }): Promise<Page<SessionRecord>>;
  /** False when the session does not exist, belongs to someone else or is already revoked. */
  revokeSession(ownerId: OwnerId, sessionId: string, now: Date): Promise<boolean>;
  revokeAllSessions(ownerId: OwnerId, now: Date): Promise<void>;

  getPreferences(ownerId: OwnerId): Promise<Preferences | null>;
  /** Compare-and-set on `version` (+1), consent rows in the same transaction; null on a version conflict. */
  updatePreferences(
    ownerId: OwnerId,
    expectedVersion: number,
    patch: PreferencesPatch,
    consents: { kind: ConsentKind; granted: boolean }[],
    now: Date,
  ): Promise<Preferences | null>;
}
