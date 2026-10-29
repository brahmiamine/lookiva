import type { Redis } from 'ioredis';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { OwnerId } from '@/platform/kernel';
import type { Hour } from '../domain/weather';
import type { Baseline, BaselineStore, Counter, FeedbackAction, FeedbackStore, SessionStore, StoredSnapshot, WeatherStore } from '../application/ports';

const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

export function createPrismaWeatherStore(db: PrismaClient): WeatherStore {
  return {
    async latest(locationKey, localDate, since) {
      const r = await db.weatherSnapshot.findFirst({ where: { locationKey, localDate, fetchedAt: { gte: since } }, orderBy: { fetchedAt: 'desc' } });
      return r && ({ id: r.id, locationKey: r.locationKey, localDate: r.localDate, provider: r.provider, issuedAt: r.issuedAt, fetchedAt: r.fetchedAt, timezone: r.timezone, hours: r.payload as Hour[] } satisfies StoredSnapshot);
    },
    async save(s) {
      await db.weatherSnapshot.create({ data: { id: s.id, locationKey: s.locationKey, localDate: s.localDate, provider: s.provider, issuedAt: s.issuedAt, fetchedAt: s.fetchedAt, timezone: s.timezone, payload: json(s.hours) } });
    },
    async purge(before) {
      await db.weatherSnapshot.deleteMany({ where: { fetchedAt: { lt: before } } });
    },
  };
}

export function createPrismaSessionStore(db: PrismaClient): SessionStore {
  return {
    async create(ownerId, id, now, expiresAt) {
      await db.recommendationSession.create({ data: { id, ownerId, fingerprints: [], createdAt: now, expiresAt } });
    },
    async shown(ownerId, id, now) {
      const r = await db.recommendationSession.findFirst({ where: { id, ownerId, expiresAt: { gt: now } } });
      return r && (r.fingerprints as string[]);
    },
    async save(ownerId, id, fingerprints, expiresAt) {
      await db.recommendationSession.updateMany({ where: { id, ownerId }, data: { fingerprints: json(fingerprints), expiresAt } });
    },
    async purgeExpired(ownerId, now) {
      await db.recommendationSession.deleteMany({ where: { ownerId, expiresAt: { lte: now } } });
    },
  };
}

export function createPrismaFeedbackStore(db: PrismaClient): FeedbackStore {
  return {
    async add(ownerId, r) {
      await db.recommendationFeedback.create({ data: { id: r.id, ownerId, sessionId: r.sessionId, fingerprint: r.fingerprint, action: r.action, garmentIds: json(r.garmentIds), createdAt: r.createdAt } });
    },
    async recent(ownerId, limit) {
      const rows = await db.recommendationFeedback.findMany({ where: { ownerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit });
      return rows.map((r) => ({ id: r.id, sessionId: r.sessionId, fingerprint: r.fingerprint, action: r.action as FeedbackAction, garmentIds: r.garmentIds as string[], createdAt: r.createdAt }));
    },
    async remove(ownerId, id) {
      return (await db.recommendationFeedback.deleteMany({ where: { id, ownerId } })).count === 1;
    },
    async removeAll(ownerId) {
      return (await db.recommendationFeedback.deleteMany({ where: { ownerId } })).count;
    },
  };
}

export function createPrismaBaselineStore(db: PrismaClient): BaselineStore {
  return {
    async upsert(ownerId: OwnerId, b: Baseline, now: Date) {
      const data = { ownerId, latitude: b.latitude, longitude: b.longitude, timezone: b.timezone, localDate: b.localDate, fromHour: b.fromHour, toHour: b.toHour, provider: b.provider, issuedAt: b.issuedAt, payload: json(b.hours), createdAt: now };
      await db.outfitWeatherBaseline.upsert({ where: { outfitId: b.outfitId }, create: { outfitId: b.outfitId, ...data }, update: data });
    },
    async get(ownerId, outfitId) {
      const r = await db.outfitWeatherBaseline.findFirst({ where: { outfitId, ownerId } });
      return r && { outfitId: r.outfitId, latitude: r.latitude, longitude: r.longitude, timezone: r.timezone, localDate: r.localDate, fromHour: r.fromHour, toHour: r.toHour, provider: r.provider, issuedAt: r.issuedAt, hours: r.payload as Hour[] };
    },
  };
}

export const createRedisCounter = (redis: Redis, prefix = 'reco'): Counter => ({
  async incr(key, ttlSeconds) {
    const k = `${prefix}:${key}`;
    const res = await redis.multi().incr(k).expire(k, ttlSeconds).exec();
    return Number(res?.[0]?.[1] ?? 0);
  },
});
