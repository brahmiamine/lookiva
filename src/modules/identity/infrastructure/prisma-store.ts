import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { newId } from '@/platform/http/ids';
import { encodeCursor } from '@/platform/http/pagination';
import type { ConsentState, IdentityStore, Preferences } from '../application/ports';
import { CONSENT_KINDS, CONSENT_PREFERENCE, isConsentKind } from '../domain/consents';

// READ COMMITTED: no gap locks, so concurrent sign-ups/token issues on the same secondary indexes cannot deadlock
// (seen under REPEATABLE READ as P2034). Every guard below is an UPDATE ... WHERE on the current row, which reads the
// latest committed version in any isolation level, so single use and compare-and-set stay exact.
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

class InactiveUser extends Error {}

const isDuplicate = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

const USER = { id: true, email: true, emailNormalized: true, emailVerifiedAt: true, status: true, createdAt: true } as const;
const SESSION = { id: true, userId: true, userAgent: true, createdAt: true, lastSeenAt: true, expiresAt: true, revokedAt: true } as const;

const EXPORT = { id: true, status: true, requestedAt: true } as const;

type PrefRow = Prisma.UserPreferencesGetPayload<object>;
const toPreferences = (r: PrefRow): Preferences => ({
  locale: r.locale,
  cityName: r.cityName,
  countryCode: r.countryCode,
  latitude: r.latitude === null ? null : r.latitude.toNumber(),
  longitude: r.longitude === null ? null : r.longitude.toNumber(),
  timezone: r.timezone,
  aiEnabled: r.aiEnabled,
  learningEnabled: r.learningEnabled,
  thermalSensitivity: r.thermalSensitivity,
  onboardingCompletedAt: r.onboardingCompletedAt,
  version: r.version,
});

/** `hooks.whileCredentialLocked` is a test seam: it runs inside the login transaction while the row lock is held. */
export function createPrismaIdentityStore(db: PrismaClient, hooks: { whileCredentialLocked?: () => Promise<void> } = {}): IdentityStore {
  return {
    findUserByEmail: (emailNormalized) => db.user.findUnique({ where: { emailNormalized }, select: USER }),
    findUserById: (id) => db.user.findUnique({ where: { id }, select: USER }),

    async createUser(u) {
      try {
        await db.$transaction([
          db.user.create({ data: { id: u.id, email: u.email, emailNormalized: u.emailNormalized, createdAt: u.now } }),
          db.credential.create({ data: { userId: u.id, passwordHash: u.passwordHash, updatedAt: u.now } }),
          db.userPreferences.create({ data: { userId: u.id, locale: u.locale } }),
        ], TX);
        return true;
      } catch (e) {
        if (isDuplicate(e)) return false;
        throw e;
      }
    },

    async getPasswordHash(userId) {
      return (await db.credential.findUnique({ where: { userId }, select: { passwordHash: true } }))?.passwordHash ?? null;
    },
    async rehashPassword(userId, oldEncoded, newEncoded) {
      const { count } = await db.credential.updateMany({ where: { userId, passwordHash: oldEncoded }, data: { passwordHash: newEncoded } });
      return count === 1;
    },

    async lastTokenAt(userId, purpose) {
      const t = await db.emailToken.findFirst({ where: { userId, purpose }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      return t?.createdAt ?? null;
    },
    issueToken: (t) =>
      db.$transaction(async (tx) => {
        let pendingPasswordHash = t.pendingPasswordHash ?? null;
        if (pendingPasswordHash === null && t.purpose === 'VERIFY_EMAIL') {
          // A plain resend inherits the password of the newest still-unused registration link it is about to void:
          // otherwise anyone could resend and turn the owner's link into one that keeps the first registrant's password.
          const latest = await tx.emailToken.findFirst({
            where: { userId: t.userId, purpose: 'VERIFY_EMAIL', usedAt: null },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { pendingPasswordHash: true },
          });
          pendingPasswordHash = latest?.pendingPasswordHash ?? null;
        }
        await tx.emailToken.updateMany({
          where: { userId: t.userId, purpose: t.purpose, usedAt: null },
          data: { usedAt: t.now, pendingPasswordHash: null },
        });
        await tx.emailToken.create({
          data: {
            id: newId(),
            userId: t.userId,
            purpose: t.purpose,
            tokenHash: t.tokenHash,
            createdAt: t.now,
            expiresAt: t.expiresAt,
            pendingPasswordHash,
          },
        });
      }, TX),
    async findLiveToken(tokenHash, purpose, now) {
      return db.emailToken.findFirst({
        where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: now }, user: { status: 'ACTIVE' } },
        select: { userId: true },
      });
    },
    consumeVerifyToken: (tokenHash, now) =>
      db.$transaction(async (tx) => {
        // The `usedAt: null` guard makes the UPDATE the arbiter: of N concurrent uses exactly one gets count 1.
        const { count } = await tx.emailToken.updateMany({
          where: { tokenHash, purpose: 'VERIFY_EMAIL', usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (count !== 1) return null;
        const { userId, pendingPasswordHash } = await tx.emailToken.findUniqueOrThrow({
          where: { tokenHash },
          select: { userId: true, pendingPasswordHash: true },
        });
        if (pendingPasswordHash !== null) await tx.emailToken.update({ where: { tokenHash }, data: { pendingPasswordHash: null } });
        const verified = await tx.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
        // The pending password applies ONLY on the transition unverified -> verified: once the mailbox is proven (by
        // this or a reset link), no stale registration link may change the password again.
        if (verified.count === 1 && pendingPasswordHash !== null) {
          await tx.credential.update({ where: { userId }, data: { passwordHash: pendingPasswordHash, updatedAt: now } });
        }
        return userId;
      }, TX),
    consumeResetToken: (tokenHash, now, passwordHash) =>
      db.$transaction(async (tx) => {
        const { count } = await tx.emailToken.updateMany({
          where: { tokenHash, purpose: 'RESET_PASSWORD', usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (count !== 1) return null;
        const { userId, user } = await tx.emailToken.findUniqueOrThrow({
          where: { tokenHash },
          select: { userId: true, user: { select: { status: true } } },
        });
        if (user.status !== 'ACTIVE') throw new InactiveUser(); // rolls the consumption back
        await tx.credential.update({ where: { userId }, data: { passwordHash, updatedAt: now } });
        await tx.sessionRegistry.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
        // Pending registration links die with the reset: none of them may later overwrite this password.
        await tx.emailToken.updateMany({
          where: { userId, purpose: 'VERIFY_EMAIL', usedAt: null },
          data: { usedAt: now, pendingPasswordHash: null },
        });
        // The link proved control of the mailbox.
        await tx.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
        return userId;
      }, TX).catch((e: unknown) => {
        if (e instanceof InactiveUser) return null;
        throw e;
      }),

    createSession: (s) =>
      db.$transaction(async (tx) => {
        // Row lock on the credential: a concurrent reset (which updates this row) is serialised with us. Either the
        // reset committed first and the hash differs (no session), or it waits and then revokes the new session.
        const rows = await tx.$queryRaw<{ passwordHash: string }[]>`
          SELECT passwordHash FROM credentials WHERE userId = ${s.userId} FOR UPDATE`;
        await hooks.whileCredentialLocked?.();
        if (rows[0]?.passwordHash !== s.expectedPasswordHash) return false;
        await tx.sessionRegistry.create({
          data: { id: s.id, userId: s.userId, tokenHash: s.tokenHash, userAgent: s.userAgent, createdAt: s.now, lastSeenAt: s.now, expiresAt: s.expiresAt },
        });
        return true;
      }, TX),
    async findSessionByTokenHash(tokenHash) {
      const row = await db.sessionRegistry.findUnique({
        where: { tokenHash },
        select: { ...SESSION, user: { select: { credential: { select: { updatedAt: true } } } } },
      });
      if (!row) return null;
      const { user, ...session } = row;
      return { ...session, passwordChangedAt: user.credential?.updatedAt ?? null };
    },
    async touchSession(id, now) {
      await db.sessionRegistry.updateMany({ where: { id, lastSeenAt: { lt: now } }, data: { lastSeenAt: now } });
    },
    async listSessions(ownerId, q) {
      const rows = await db.sessionRegistry.findMany({
        where: {
          userId: ownerId,
          revokedAt: null,
          lastSeenAt: { gt: q.activeSince },
          expiresAt: { gt: q.now },
          ...(q.cursor ? { id: { lt: q.cursor.id } } : {}),
        },
        orderBy: { id: 'desc' }, // UUIDv7: newest first
        take: q.limit + 1,
        select: SESSION,
      });
      const items = rows.slice(0, q.limit);
      const last = items.at(-1);
      return rows.length > q.limit && last ? { items, nextCursor: encodeCursor({ id: last.id }) } : { items };
    },
    async revokeSession(ownerId, sessionId, now) {
      const { count } = await db.sessionRegistry.updateMany({ where: { id: sessionId, userId: ownerId, revokedAt: null }, data: { revokedAt: now } });
      return count === 1;
    },
    async revokeAllSessions(ownerId, now) {
      await db.sessionRegistry.updateMany({ where: { userId: ownerId, revokedAt: null }, data: { revokedAt: now } });
    },

    deactivate: (ownerId, now) =>
      db.$transaction(async (tx) => {
        const { count } = await tx.user.updateMany({ where: { id: ownerId, status: 'ACTIVE' }, data: { status: 'DISABLED' } });
        if (count !== 1) return false;
        await tx.sessionRegistry.updateMany({ where: { userId: ownerId, revokedAt: null }, data: { revokedAt: now } });
        return true;
      }, TX),
    requestDeletion: (ownerId, id, now) =>
      db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM users WHERE id = ${ownerId} FOR UPDATE`;
        const status = rows[0]?.status;
        if (status === 'DELETION_REQUESTED') {
          const pending = await tx.deletionRequest.findFirst({ where: { userId: ownerId, status: 'PENDING' }, orderBy: { requestedAt: 'desc' } });
          return pending ? { requestedAt: pending.requestedAt } : null;
        }
        if (status !== 'ACTIVE' && status !== 'DISABLED') return null;
        await tx.user.update({ where: { id: ownerId }, data: { status: 'DELETION_REQUESTED' } });
        await tx.deletionRequest.create({ data: { id, userId: ownerId, previousStatus: status, requestedAt: now } });
        await tx.sessionRegistry.updateMany({ where: { userId: ownerId, revokedAt: null }, data: { revokedAt: now } });
        return { requestedAt: now };
      }, TX),
    cancelDeletion: (ownerId, now) =>
      db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`;
        const pending = await tx.deletionRequest.findFirst({ where: { userId: ownerId, status: 'PENDING' } });
        if (!pending) return false;
        await tx.deletionRequest.update({ where: { id: pending.id }, data: { status: 'CANCELLED', cancelledAt: now } });
        await tx.user.update({ where: { id: ownerId }, data: { status: pending.previousStatus } });
        return true;
      }, TX),
    async createExportRequest(ownerId, id, now) {
      const r = await db.exportRequest.create({ data: { id, userId: ownerId, requestedAt: now }, select: EXPORT });
      return r;
    },
    async listExportRequests(ownerId, q) {
      const rows = await db.exportRequest.findMany({
        where: { userId: ownerId, ...(q.cursor ? { id: { lt: q.cursor.id } } : {}) },
        orderBy: { id: 'desc' },
        take: q.limit + 1,
        select: EXPORT,
      });
      const items = rows.slice(0, q.limit);
      const last = items.at(-1);
      return rows.length > q.limit && last ? { items, nextCursor: encodeCursor({ id: last.id }) } : { items };
    },

    recordConsent: (ownerId, kind, granted, now) =>
      db.$transaction(async (tx) => {
        // Row lock first: concurrent PUTs for one user serialise, so the flag always equals the latest record.
        await tx.$queryRaw`SELECT userId FROM user_preferences WHERE userId = ${ownerId} FOR UPDATE`;
        await tx.consentRecord.create({ data: { id: newId(), userId: ownerId, kind, granted, createdAt: now } });
        const flag = kind === 'AI_RECOMMENDATIONS' || kind === 'LEARNING' ? CONSENT_PREFERENCE[kind] : null;
        // Only a real change bumps the version (the ETag of the preferences stays stable on a repeated PUT).
        if (flag) await tx.userPreferences.updateMany({ where: { userId: ownerId, [flag]: { not: granted } }, data: { [flag]: granted, version: { increment: 1 } } });
        return { kind, granted, updatedAt: now };
      }, TX),
    async latestConsents(ownerId) {
      // One indexed lookup per kind (userId, kind, createdAt): bounded whatever the history length.
      const rows = await Promise.all(
        CONSENT_KINDS.map((kind) => db.consentRecord.findFirst({ where: { userId: ownerId, kind }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })),
      );
      return rows.flatMap((r) => (r && isConsentKind(r.kind) ? [{ kind: r.kind, granted: r.granted, updatedAt: r.createdAt } satisfies ConsentState] : []));
    },

    async getPreferences(ownerId) {
      const r = await db.userPreferences.findUnique({ where: { userId: ownerId } });
      return r && toPreferences(r);
    },
    updatePreferences: (ownerId, expectedVersion, patch, consents, now) =>
      db.$transaction(async (tx) => {
        const { count } = await tx.userPreferences.updateMany({
          where: { userId: ownerId, version: expectedVersion },
          data: { ...patch, version: { increment: 1 } },
        });
        if (count !== 1) return null;
        if (consents.length > 0) {
          await tx.consentRecord.createMany({ data: consents.map((c) => ({ id: newId(), userId: ownerId, ...c, createdAt: now })) });
        }
        return toPreferences(await tx.userPreferences.findUniqueOrThrow({ where: { userId: ownerId } }));
      }, TX),
  };
}

/**
 * Retention job (to schedule in the worker): deletes tokens created before `olderThan` that can no longer be used
 * (used, or expired at `now`). A live token is never deleted. Suggested cutoff: 7 days.
 */
export async function purgeEmailTokens(db: PrismaClient, olderThan: Date, now: Date): Promise<number> {
  const { count } = await db.emailToken.deleteMany({
    where: { createdAt: { lt: olderThan }, OR: [{ usedAt: { not: null } }, { expiresAt: { lte: now } }] },
  });
  return count;
}
