import type { OwnerId, Page } from '@/platform/kernel';
import type { TokenPurpose } from '../domain/policy';
import type { ConsentKind } from '../domain/consents';
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
export type ExportRequestRecord = { id: string; status: 'PENDING'; requestedAt: Date };
export type { ConsentKind };
export type ConsentState = { kind: ConsentKind; granted: boolean; updatedAt: Date | null };

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
  /** Same password, stronger parameters: compare-and-set on the old encoding, `updatedAt` untouched. */
  rehashPassword(userId: string, oldEncoded: string, newEncoded: string): Promise<boolean>;

  lastTokenAt(userId: string, purpose: TokenPurpose): Promise<Date | null>;
  /** Stores a new token and voids the user's older unused tokens of the same purpose. */
  issueToken(t: {
    userId: string;
    purpose: TokenPurpose;
    tokenHash: string;
    now: Date;
    expiresAt: Date;
    /** Registration only: password applied when this very link is used. */
    pendingPasswordHash?: string;
  }): Promise<void>;
  findLiveToken(tokenHash: string, purpose: TokenPurpose, now: Date): Promise<{ userId: string } | null>;
  /** Atomic single use (`usedAt IS NULL` guard) + marks the email verified + applies the token's pending password, if any. */
  consumeVerifyToken(tokenHash: string, now: Date): Promise<string | null>;
  /** Atomic single use + new password + every session revoked + email verified, in one transaction; ACTIVE users only. */
  consumeResetToken(tokenHash: string, now: Date, passwordHash: string): Promise<string | null>;

  /**
   * Creates the session only if the credential still holds `expectedPasswordHash`, checked under a row lock
   * (SELECT ... FOR UPDATE) in the same transaction: a reset committed after the password check wins.
   */
  createSession(s: {
    id: string;
    userId: string;
    tokenHash: string;
    userAgent: string;
    now: Date;
    expiresAt: Date;
    expectedPasswordHash: string;
  }): Promise<boolean>;
  /** The session plus the last password change (credentials.updatedAt). */
  findSessionByTokenHash(tokenHash: string): Promise<(SessionRecord & { passwordChangedAt: Date | null }) | null>;
  touchSession(id: string, now: Date): Promise<void>;
  /** Live sessions (not revoked, lastSeenAt >= activeSince, expiresAt > now), newest first, cursor on id. */
  listSessions(ownerId: OwnerId, q: { activeSince: Date; now: Date; limit: number; cursor?: { id: string } }): Promise<Page<SessionRecord>>;
  /** False when the session does not exist, belongs to someone else or is already revoked. */
  revokeSession(ownerId: OwnerId, sessionId: string, now: Date): Promise<boolean>;
  revokeAllSessions(ownerId: OwnerId, now: Date): Promise<void>;

  /** ACTIVE -> DISABLED and every session revoked, atomically; false when the account was not ACTIVE. */
  deactivate(ownerId: OwnerId, now: Date): Promise<boolean>;
  /**
   * Under a row lock on the user: ACTIVE/DISABLED -> DELETION_REQUESTED, a PENDING row remembering the previous status,
   * every session revoked. Already DELETION_REQUESTED: returns the existing pending request unchanged (idempotent).
   */
  requestDeletion(ownerId: OwnerId, newId: string, now: Date): Promise<{ requestedAt: Date } | null>;
  /** Restores the remembered status and marks the PENDING request CANCELLED; false when none is pending. */
  cancelDeletion(ownerId: OwnerId, now: Date): Promise<boolean>;
  createExportRequest(ownerId: OwnerId, id: string, now: Date): Promise<ExportRequestRecord>;
  /** Own requests only, newest first, cursor on id (UUIDv7). */
  listExportRequests(ownerId: OwnerId, q: { limit: number; cursor?: { id: string } }): Promise<Page<ExportRequestRecord>>;

  /** Appends a consent row; for AI_RECOMMENDATIONS / LEARNING the matching preferences flag follows in the same transaction. */
  recordConsent(ownerId: OwnerId, kind: ConsentKind, granted: boolean, now: Date): Promise<ConsentState>;
  /** Latest row per kind that has any (newest createdAt, then id). */
  latestConsents(ownerId: OwnerId): Promise<ConsentState[]>;

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
