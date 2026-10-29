import type { OwnerId } from '@/platform/kernel';
import type { Hour } from '../domain/weather';

export type StoredSnapshot = { id: string; locationKey: string; localDate: string; provider: string; issuedAt: Date; fetchedAt: Date; timezone: string; hours: Hour[] };
export interface WeatherStore {
  /** Newest snapshot of (place, day) fetched at or after `since`. */
  latest(locationKey: string, localDate: string, since: Date): Promise<StoredSnapshot | null>;
  save(s: StoredSnapshot): Promise<void>;
  /** Housekeeping: deletes snapshots fetched before `before`. */
  purge(before: Date): Promise<void>;
}

export type FeedbackAction = 'ACCEPT' | 'REJECT' | 'MODIFY';
export type FeedbackRow = { id: string; sessionId: string | null; fingerprint: string; action: FeedbackAction; garmentIds: string[]; createdAt: Date };
export interface FeedbackStore {
  add(ownerId: OwnerId, row: FeedbackRow): Promise<void>;
  recent(ownerId: OwnerId, limit: number): Promise<FeedbackRow[]>;
  remove(ownerId: OwnerId, id: string): Promise<boolean>;
  removeAll(ownerId: OwnerId): Promise<number>;
}

export interface SessionStore {
  create(ownerId: OwnerId, id: string, now: Date, expiresAt: Date): Promise<void>;
  /** Fingerprints already shown; null = unknown, foreign or expired. */
  shown(ownerId: OwnerId, id: string, now: Date): Promise<string[] | null>;
  save(ownerId: OwnerId, id: string, fingerprints: string[], expiresAt: Date): Promise<void>;
  /** Housekeeping: deletes the owner's expired sessions. */
  purgeExpired(ownerId: OwnerId, now: Date): Promise<void>;
}

export type Baseline = { outfitId: string; latitude: number; longitude: number; timezone: string; localDate: string; fromHour: number; toHour: number; provider: string; issuedAt: Date; hours: Hour[] };
export interface BaselineStore {
  upsert(ownerId: OwnerId, b: Baseline, now: Date): Promise<void>;
  get(ownerId: OwnerId, outfitId: string): Promise<Baseline | null>;
}

/** Atomic counter with expiry (Redis in production). */
export interface Counter {
  incr(key: string, ttlSeconds: number): Promise<number>;
}
