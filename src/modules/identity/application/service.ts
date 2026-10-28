import { z } from 'zod';
import type { Audit } from '@/platform/audit/port';
import type { Clock } from '@/platform/clock/port';
import type { Email } from '@/platform/email/port';
import { assertIfMatch } from '@/platform/http/etag';
import { AppError } from '@/platform/http/errors';
import { newId } from '@/platform/http/ids';
import type { OwnerId, Page } from '@/platform/kernel';
import { normalizeEmail } from '../domain/email';
import { checkPassword } from '../domain/password-policy';
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  TOKEN_TTL_MS,
  cooldownLeftMs,
  sessionIsActive,
  sessionNeedsTouch,
  type TokenPurpose,
} from '../domain/policy';
import type { Locale } from '../domain/preferences';
import { summariseUserAgent } from '../domain/user-agent';
import { buildMail } from './mail';
import type {
  ConsentKind,
  ExportRequestRecord,
  IdentityStore,
  PasswordHasher,
  Preferences,
  PreferencesPatch,
  TokenGenerator,
  UserRecord,
} from './ports';

export type IdentityServiceDeps = {
  store: IdentityStore;
  hasher: PasswordHasher;
  tokens: TokenGenerator;
  clock: Clock;
  audit: Audit;
  mailer: Email;
  /** APP_ORIGIN: the only base of mailed links (never derived from Host or X-Forwarded-*). */
  appOrigin: string;
  /** Test seam: runs after a successful password check, before the session is created (race tests). */
  hooks?: { afterPasswordCheck?: () => Promise<void> };
};

export type Me = { id: string; email: string; emailVerifiedAt: Date | null; createdAt: Date };
export type SessionView = { id: string; userAgent: string; createdAt: Date; lastSeenAt: Date; current: boolean };
export type OnboardingInput = {
  locale: Locale;
  cityName: string;
  countryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string;
};

const INVALID_TOKEN = () => new AppError('INVALID_TOKEN', 400, 'The link is invalid or has expired');
const INVALID_CREDENTIALS = () => new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password');
const UNAUTHENTICATED = () => new AppError('UNAUTHENTICATED', 401, 'Authentication required');
const validation = (path: string, message: string) =>
  new AppError('VALIDATION_ERROR', 400, 'Validation failed', [{ path, message }]);
const emailFormat = z.email({ pattern: z.regexes.unicodeEmail }).max(254);

const toMe = (u: UserRecord): Me => ({ id: u.id, email: u.email, emailVerifiedAt: u.emailVerifiedAt, createdAt: u.createdAt });

export function createIdentityService(d: IdentityServiceDeps) {
  if (!d.appOrigin) throw new Error('APP_ORIGIN is required to send identity emails');
  const now = () => d.clock.now();

  function normalized(email: string): string {
    const n = normalizeEmail(email);
    if (!emailFormat.safeParse(n).success) throw validation('email', 'invalid_email');
    return n;
  }

  async function localeOf(userId: string): Promise<Locale> {
    return (await d.store.getPreferences(userId as OwnerId))?.locale ?? 'fr';
  }

  /**
   * Issues a token and mails it, unless one of the same purpose was sent less than RESEND_COOLDOWN_MS ago.
   * A registration (`pendingPasswordHash`) always issues: its link must carry the password just typed.
   */
  async function issueAndSend(
    user: UserRecord,
    purpose: TokenPurpose,
    opts: { locale?: Locale; pendingPasswordHash?: string } = {},
  ): Promise<boolean> {
    const t = now();
    if (!opts.pendingPasswordHash && cooldownLeftMs(await d.store.lastTokenAt(user.id, purpose), t) > 0) return false;
    const { token, hash } = d.tokens.generate();
    await d.store.issueToken({
      userId: user.id,
      purpose,
      tokenHash: hash,
      now: t,
      expiresAt: new Date(t.getTime() + TOKEN_TTL_MS[purpose]),
      pendingPasswordHash: opts.pendingPasswordHash,
    });
    // Sent after the token is committed, never inside a transaction.
    const kind = purpose === 'VERIFY_EMAIL' ? 'verify' : 'reset';
    await d.mailer.send(buildMail(kind, opts.locale ?? (await localeOf(user.id)), user.email, d.appOrigin, token));
    return true;
  }

  function assertPolicy(password: string, emailNormalized: string): void {
    const problem = checkPassword(password, emailNormalized);
    if (problem) throw validation('password', problem);
  }

  return {
    /**
     * Same answer and the same expensive work (one scrypt) whether or not the email is already registered.
     * The password becomes effective only through the verification link of this registration (pendingPasswordHash).
     */
    async register(input: { email: string; password: string; locale: Locale }): Promise<void> {
      const emailNormalized = normalized(input.email);
      assertPolicy(input.password, emailNormalized);
      const passwordHash = await d.hasher.hash(input.password);
      let user = await d.store.findUserByEmail(emailNormalized);
      if (!user) {
        const id = newId();
        const created = await d.store.createUser({
          id,
          email: input.email.trim(),
          emailNormalized,
          passwordHash,
          locale: input.locale,
          now: now(),
        });
        if (created) {
          await d.audit.record({ actorId: id, action: 'identity.registered' });
          user = await d.store.findUserById(id);
          if (user) await issueAndSend(user, 'VERIFY_EMAIL', { locale: input.locale, pendingPasswordHash: passwordHash });
          return;
        }
        user = await d.store.findUserByEmail(emailNormalized); // lost a concurrent race: behave as "exists"
      }
      if (user && user.status === 'ACTIVE' && user.emailVerifiedAt === null) {
        // Unverified: nobody proved the mailbox yet, so this registration's password rides on its own link
        // (the newest link wins; older ones are voided). A verified account is never touched.
        await issueAndSend(user, 'VERIFY_EMAIL', { pendingPasswordHash: passwordHash });
      }
    },

    async verifyEmail(token: string): Promise<void> {
      const userId = await d.store.consumeVerifyToken(d.tokens.hash(token), now());
      if (!userId) throw INVALID_TOKEN();
      await d.audit.record({ actorId: userId, action: 'identity.email_verified' });
    },

    async resendVerification(input: { email: string }): Promise<void> {
      const user = await d.store.findUserByEmail(normalized(input.email));
      if (user && user.status === 'ACTIVE' && user.emailVerifiedAt === null) {
        await issueAndSend(user, 'VERIFY_EMAIL');
      }
    },

    /** 401 INVALID_CREDENTIALS for unknown email, wrong password or a non-active account; 403 only after a correct password. */
    async login(input: { email: string; password: string; userAgent: string | null }) {
      const user = await d.store.findUserByEmail(normalized(input.email));
      const encoded = user ? await d.store.getPasswordHash(user.id) : null;
      const ok = await d.hasher.verify(input.password, encoded);
      if (!user || !ok || !encoded || user.status !== 'ACTIVE') throw INVALID_CREDENTIALS();
      if (user.emailVerifiedAt === null) throw new AppError('EMAIL_NOT_VERIFIED', 403, 'Email address not verified yet');
      await d.hooks?.afterPasswordCheck?.();
      const t = now();
      const { token, hash } = d.tokens.generate();
      const sessionId = newId();
      const created = await d.store.createSession({
        id: sessionId,
        userId: user.id,
        tokenHash: hash,
        userAgent: summariseUserAgent(input.userAgent),
        now: t,
        expiresAt: new Date(t.getTime() + SESSION_ABSOLUTE_MS),
        expectedPasswordHash: encoded,
      });
      // The password changed since we checked it (concurrent reset): the old password no longer opens a session.
      if (!created) throw INVALID_CREDENTIALS();
      if (d.hasher.needsRehash(encoded)) {
        await d.store.rehashPassword(user.id, encoded, await d.hasher.hash(input.password)); // CAS: never reverts a reset
      }
      await d.audit.record({ actorId: user.id, action: 'identity.login', target: sessionId });
      return { token, sessionId, user: toMe(user) };
    },

    /** Resolves a session cookie on every request: unknown, revoked, idle/absolutely expired or inactive user => 401. */
    async authenticate(token: string): Promise<{ userId: OwnerId; sessionId: string }> {
      const t = now();
      const s = await d.store.findSessionByTokenHash(d.tokens.hash(token));
      if (!s || !sessionIsActive(s, t)) throw UNAUTHENTICATED();
      // Any session opened before the last password change is dead, even if a revocation was missed.
      if (s.passwordChangedAt !== null && s.createdAt < s.passwordChangedAt) throw UNAUTHENTICATED();
      const user = await d.store.findUserById(s.userId);
      if (!user || user.status !== 'ACTIVE' || user.emailVerifiedAt === null) throw UNAUTHENTICATED();
      if (sessionNeedsTouch(s, t)) await d.store.touchSession(s.id, t);
      return { userId: user.id as OwnerId, sessionId: s.id };
    },

    async logout(ownerId: OwnerId, sessionId: string): Promise<void> {
      await d.store.revokeSession(ownerId, sessionId, now());
      await d.audit.record({ actorId: ownerId, action: 'identity.logout', target: sessionId });
    },

    async logoutAll(ownerId: OwnerId): Promise<void> {
      await d.store.revokeAllSessions(ownerId, now());
      await d.audit.record({ actorId: ownerId, action: 'identity.logout_all' });
    },

    async listSessions(ownerId: OwnerId, currentSessionId: string, page: { limit: number; cursor?: { id: string } }): Promise<Page<SessionView>> {
      const t = now();
      const res = await d.store.listSessions(ownerId, { ...page, now: t, activeSince: new Date(t.getTime() - SESSION_IDLE_MS) });
      return {
        ...res,
        items: res.items.map((s) => ({
          id: s.id,
          userAgent: s.userAgent,
          createdAt: s.createdAt,
          lastSeenAt: s.lastSeenAt,
          current: s.id === currentSessionId,
        })),
      };
    },

    /** Another user's (or an unknown) session id is 404, exactly like a missing one. */
    async revokeSession(ownerId: OwnerId, sessionId: string): Promise<void> {
      if (!(await d.store.revokeSession(ownerId, sessionId, now()))) throw new AppError('NOT_FOUND', 404, 'Session not found');
      await d.audit.record({ actorId: ownerId, action: 'identity.session_revoked', target: sessionId });
    },

    async forgotPassword(input: { email: string }): Promise<void> {
      const user = await d.store.findUserByEmail(normalized(input.email));
      if (user && user.status === 'ACTIVE') {
        if (await issueAndSend(user, 'RESET_PASSWORD')) {
          await d.audit.record({ actorId: user.id, action: 'identity.password_reset_requested' });
        }
      } else {
        d.tokens.generate(); // keep the unknown-email path doing comparable work
      }
    },

    /** Validates before consuming, so a refused password does not burn the link. Revokes every session. */
    async resetPassword(input: { token: string; password: string }): Promise<void> {
      const tokenHash = d.tokens.hash(input.token);
      const live = await d.store.findLiveToken(tokenHash, 'RESET_PASSWORD', now());
      const user = live && (await d.store.findUserById(live.userId));
      if (!user) throw INVALID_TOKEN();
      assertPolicy(input.password, user.emailNormalized);
      const passwordHash = await d.hasher.hash(input.password);
      const userId = await d.store.consumeResetToken(tokenHash, now(), passwordHash);
      if (!userId) throw INVALID_TOKEN();
      await d.audit.record({ actorId: userId, action: 'identity.password_reset' });
    },

    /** Sensitive actions re-check the current password. Any failure is the generic 401 (no oracle). */
    async reauth(ownerId: OwnerId, password: string): Promise<void> {
      const encoded = await d.store.getPasswordHash(ownerId);
      if (!(await d.hasher.verify(password, encoded)) || !encoded) throw INVALID_CREDENTIALS();
    },

    /** DISABLED + every session revoked. The audit event carries the user id only. */
    async deactivate(ownerId: OwnerId, password: string): Promise<void> {
      await this.reauth(ownerId, password);
      if (!(await d.store.deactivate(ownerId, now()))) throw UNAUTHENTICATED();
      await d.audit.record({ actorId: ownerId, action: 'identity.account_deactivated' });
    },

    /** Idempotent: a repeat returns the same pending request. Nothing is purged here (backups are not promised purged). */
    async requestDeletion(ownerId: OwnerId, password: string): Promise<{ requestedAt: Date }> {
      await this.reauth(ownerId, password);
      const r = await d.store.requestDeletion(ownerId, newId(), now());
      if (!r) throw UNAUTHENTICATED();
      await d.audit.record({ actorId: ownerId, action: 'identity.deletion_requested' });
      return r;
    },

    /**
     * Sessions are revoked by the request, so cancelling proves the account with email + password instead (like login:
     * every failure is the generic 401). A correct password with nothing pending is 404.
     */
    async cancelDeletion(input: { email: string; password: string }): Promise<void> {
      const user = await d.store.findUserByEmail(normalized(input.email));
      const encoded = user ? await d.store.getPasswordHash(user.id) : null;
      const ok = await d.hasher.verify(input.password, encoded);
      if (!user || !ok || !encoded) throw INVALID_CREDENTIALS();
      if (!(await d.store.cancelDeletion(user.id as OwnerId, now()))) throw new AppError('NOT_FOUND', 404, 'No pending deletion request');
      await d.audit.record({ actorId: user.id, action: 'identity.deletion_cancelled' });
    },

    /** Records the request only: no export is generated in this phase. */
    async requestExport(ownerId: OwnerId): Promise<ExportRequestRecord> {
      const r = await d.store.createExportRequest(ownerId, newId(), now());
      await d.audit.record({ actorId: ownerId, action: 'identity.export_requested', target: r.id });
      return r;
    },

    listExportRequests: (ownerId: OwnerId, page: { limit: number; cursor?: { id: string } }) => d.store.listExportRequests(ownerId, page),

    async getMe(ownerId: OwnerId): Promise<Me> {
      const user = await d.store.findUserById(ownerId);
      if (!user) throw UNAUTHENTICATED();
      return toMe(user);
    },

    async getPreferences(ownerId: OwnerId): Promise<Preferences> {
      const p = await d.store.getPreferences(ownerId);
      if (!p) throw new AppError('NOT_FOUND', 404, 'Preferences not found');
      return p;
    },

    /** Optimistic concurrency: If-Match must carry the current ETag (428 / 409). Toggling AI or learning records consent. */
    async updatePreferences(ownerId: OwnerId, ifMatch: string | null, patch: PreferencesPatch): Promise<Preferences> {
      const current = await this.getPreferences(ownerId);
      assertIfMatch(ifMatch, current.version);
      const consents: { kind: ConsentKind; granted: boolean }[] = [];
      if (patch.aiEnabled !== undefined && patch.aiEnabled !== current.aiEnabled) consents.push({ kind: 'AI', granted: patch.aiEnabled });
      if (patch.learningEnabled !== undefined && patch.learningEnabled !== current.learningEnabled) {
        consents.push({ kind: 'LEARNING', granted: patch.learningEnabled });
      }
      const updated = await d.store.updatePreferences(ownerId, current.version, patch, consents, now());
      if (!updated) throw new AppError('VERSION_CONFLICT', 409, 'Resource version does not match If-Match');
      await d.audit.record({ actorId: ownerId, action: 'identity.preferences_updated' });
      return updated;
    },

    /** Only locale + city are required; GPS is optional; timezone defaults to UTC until the client or geocoding sets it. */
    async completeOnboarding(ownerId: OwnerId, input: OnboardingInput): Promise<Preferences> {
      const current = await this.getPreferences(ownerId);
      const updated = await d.store.updatePreferences(
        ownerId,
        current.version,
        {
          locale: input.locale,
          cityName: input.cityName,
          countryCode: input.countryCode ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          timezone: input.timezone ?? current.timezone ?? 'UTC',
          onboardingCompletedAt: current.onboardingCompletedAt ?? now(),
        },
        [],
        now(),
      );
      if (!updated) throw new AppError('VERSION_CONFLICT', 409, 'Preferences changed meanwhile, retry');
      await d.audit.record({ actorId: ownerId, action: 'identity.onboarding_completed' });
      return updated;
    },
  };
}

export type IdentityService = ReturnType<typeof createIdentityService>;
