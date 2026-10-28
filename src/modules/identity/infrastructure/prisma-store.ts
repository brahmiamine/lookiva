import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { newId } from '@/platform/http/ids';
import { encodeCursor } from '@/platform/http/pagination';
import type { IdentityStore, Preferences } from '../application/ports';

// READ COMMITTED: no gap locks, so concurrent sign-ups/token issues on the same secondary indexes cannot deadlock
// (seen under REPEATABLE READ as P2034). Every guard below is an UPDATE ... WHERE on the current row, which reads the
// latest committed version in any isolation level, so single use and compare-and-set stay exact.
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

class InactiveUser extends Error {}

const isDuplicate = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

const USER = { id: true, email: true, emailNormalized: true, emailVerifiedAt: true, status: true, createdAt: true } as const;
const SESSION = { id: true, userId: true, userAgent: true, createdAt: true, lastSeenAt: true, expiresAt: true, revokedAt: true } as const;

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

export function createPrismaIdentityStore(db: PrismaClient): IdentityStore {
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
    async issueToken(t) {
      await db.$transaction([
        db.emailToken.updateMany({ where: { userId: t.userId, purpose: t.purpose, usedAt: null }, data: { usedAt: t.now } }),
        db.emailToken.create({
          data: {
            id: newId(),
            userId: t.userId,
            purpose: t.purpose,
            tokenHash: t.tokenHash,
            createdAt: t.now,
            expiresAt: t.expiresAt,
            pendingPasswordHash: t.pendingPasswordHash ?? null,
          },
        }),
      ], TX);
    },
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
        if (pendingPasswordHash !== null) {
          // The registration whose link was opened from the mailbox sets the password (pre-registration hijack fix).
          await tx.credential.update({ where: { userId }, data: { passwordHash: pendingPasswordHash, updatedAt: now } });
          await tx.emailToken.update({ where: { tokenHash }, data: { pendingPasswordHash: null } });
        }
        await tx.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
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
