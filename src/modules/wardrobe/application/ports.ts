import type { OwnerId, OwnerScopedRepository, Page } from '@/platform/kernel';
import type { WeatherField } from '../domain/garment';
import type { GarmentStatus } from '../domain/status';

export type ColorRef = { code: string; shade: string | null };

/** What a client may set on a garment (create / merged patch). Exactly one of subtypeCode / customSubcategoryId is set. */
export type GarmentData = {
  nickname: string | null;
  categoryCode: string;
  subtypeCode: string | null;
  customSubcategoryId: string | null;
  primaryColor: ColorRef;
  extraColors: ColorRef[];
  seasons: string[];
  styles: string[];
  purchasePrice: number | null;
  purchaseCurrency: string | null;
  purchasedOn: string | null;
  purchaseStore: string | null;
  notes: string | null;
} & Record<WeatherField, string>;

export type GarmentView = Omit<GarmentData, 'customSubcategoryId'> & {
  id: string;
  customSubcategory: { id: string; label: string; parentSubtypeCode: string } | null;
  status: GarmentStatus;
  recommendable: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type TrashedGarmentView = GarmentView & { deletedAt: string; purgeAfter: string };

export type BulkOp =
  | { action: 'SET_STATUS'; status: GarmentStatus; note: string | null }
  | { action: 'SET_CATEGORY'; categoryCode: string; subtypeCode: string | null; customSubcategoryId: string | null }
  | { action: 'DELETE' };
export type BulkFailure = { id: string; code: 'NOT_FOUND' | 'VERSION_CONFLICT'; currentVersion?: number };
/** `changed` were written; `unchanged` already had the requested status (SET_STATUS only: no event, no version bump). */
export type BulkResult = { ok: true; changed: string[]; unchanged: string[] } | { ok: false; failures: BulkFailure[] };

/** Implemented by the outfits module (phase 05); the default checker reports nothing. Warnings are advisory, never blocking. */
export type UsageWarning = { garmentId: string; kind: string; count: number };
export interface GarmentUsageChecker {
  check(ownerId: OwnerId, garmentIds: string[]): Promise<UsageWarning[]>;
}
export const noUsage: GarmentUsageChecker = { check: async () => [] };

export type GarmentFilter = { category?: string; subtype?: string; color?: string; season?: string; style?: string; status?: string; q?: string };
export type PageArg = { limit: number; cursor?: { id: string } };

export type StatusEventView = { id: string; fromStatus: GarmentStatus | null; toStatus: GarmentStatus; source: string; note: string | null; at: string };

export interface GarmentStore extends OwnerScopedRepository<GarmentView> {
  list(ownerId: OwnerId, page: PageArg & { filter?: GarmentFilter }): Promise<Page<GarmentView>>;
  /** Creates the garment (status AVAILABLE) and its first status event in one transaction. */
  create(ownerId: OwnerId, data: GarmentData, now: Date): Promise<GarmentView>;
  /** Compare-and-set on `expectedVersion`; null = the version moved (or the garment is gone). */
  update(ownerId: OwnerId, id: string, expectedVersion: number, data: GarmentData, now: Date): Promise<GarmentView | null>;
  /** Compare-and-set + history event in one transaction; null as above. */
  changeStatus(ownerId: OwnerId, id: string, expectedVersion: number, to: GarmentStatus, note: string | null, now: Date, source?: string): Promise<GarmentView | null>;
  softDelete(ownerId: OwnerId, id: string, now: Date): Promise<boolean>;
  listStatusEvents(ownerId: OwnerId, garmentId: string, page: PageArg): Promise<Page<StatusEventView>>;
  /** Garments of the owner, trashed ones included (they still occupy storage). */
  countOwned(ownerId: OwnerId): Promise<number>;
  listTrash(ownerId: OwnerId, page: PageArg): Promise<Page<TrashedGarmentView>>;
  /** 'missing' = not trashed / unknown / purged, 'expired' = purgeAfter passed (not purged yet), 'custom_missing' = its custom subcategory is gone. */
  restore(ownerId: OwnerId, id: string, now: Date): Promise<GarmentView | 'missing' | 'expired' | 'custom_missing'>;
  /** All-or-nothing in ONE transaction on the locked rows (ordered by id). Only `ids` are touched. */
  bulk(ownerId: OwnerId, ids: string[], op: BulkOp, expectedVersions: Record<string, number>, now: Date): Promise<BulkResult>;
  /** Compensation for a half-finished duplication: removes the row for good (no trash). */
  hardDelete(ownerId: OwnerId, id: string): Promise<void>;
  /** Deletes up to `limit` garments whose purgeAfter <= now (children cascade) and returns their photo storage keys. */
  purgeExpired(now: Date, limit: number): Promise<{ ids: string[]; keys: string[] }>;
  /** Ids a recommendation may use: AVAILABLE and not trashed. */
  recommendableIds(ownerId: OwnerId): Promise<string[]>;
}

export type CustomSubcategoryView = {
  id: string;
  label: string;
  parentSubtypeCode: string;
  categoryCode: string;
  garmentCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export interface CustomSubcategoryStore extends OwnerScopedRepository<CustomSubcategoryView> {
  /** null = label already used by this owner. */
  create(ownerId: OwnerId, c: { label: string; parentSubtypeCode: string }, now: Date): Promise<CustomSubcategoryView | null>;
  /** 'conflict' = version moved, 'exists' = another one has that label. */
  rename(ownerId: OwnerId, id: string, expectedVersion: number, label: string, now: Date): Promise<CustomSubcategoryView | 'conflict' | 'exists'>;
  /**
   * One transaction: garments of `id` move to `target` (or nothing to move), then `id` is deleted.
   * 'in_use' = garments still reference it (or the target vanished): nothing changed.
   */
  remove(ownerId: OwnerId, id: string, target: { subtypeCode: string } | { customSubcategoryId: string } | null, now: Date): Promise<'ok' | 'in_use' | 'missing'>;
}

/** What other modules (outfits) may know about a garment: no photo, no purchase data. */
export type GarmentRef = {
  id: string;
  nickname: string | null;
  categoryCode: string;
  subtypeCode: string | null;
  customSubtypeLabel: string | null;
  primaryColorCode: string;
  extraColorCodes: string[];
  status: GarmentStatus;
  version: number;
  trashed: boolean;
};
export type SetStatusResult = { ok: true; ref: GarmentRef } | { ok: false; code: 'NOT_FOUND' | 'VERSION_CONFLICT' | 'NOT_ELIGIBLE'; status?: GarmentStatus; currentVersion?: number };
/** Categorical attributes of an own, non-trashed, AVAILABLE garment: what the recommendation engine (and only that) may read. No photo, name, notes or price. */
export type RecommendableGarment = {
  id: string; categoryCode: string; subtypeCode: string | null; primaryColorCode: string; extraColorCodes: string[];
  warmth: string; rain: string; windproof: string; breathability: string; layering: string; seasons: string[]; styles: string[];
};
/** Public port for other modules: owner scoped, goes through the same compare-and-set and status-event path as the API. */
export interface GarmentGateway {
  /** Own garments among `ids`, trashed ones included (flagged); unknown and foreign ids are simply absent. */
  find(ownerId: OwnerId, ids: string[]): Promise<GarmentRef[]>;
  /** Own, non-trashed garment to `to` (history event with `source`). `onlyFrom`: refuse (NOT_ELIGIBLE) from any other status. */
  setStatus(ownerId: OwnerId, id: string, to: GarmentStatus, o: { source: string; note: string | null; expectedVersion?: number; onlyFrom?: GarmentStatus[] }): Promise<SetStatusResult>;
  /** Ids of own, non-trashed AVAILABLE garments of a category (replacement suggestions). */
  availableInCategory(ownerId: OwnerId, categoryCode: string, excludeIds: string[], limit: number): Promise<string[]>;
  /** Own, non-trashed, AVAILABLE garments (newest ids first, at most `limit`) with weather-relevant attributes only. */
  listRecommendable(ownerId: OwnerId, limit: number): Promise<RecommendableGarment[]>;
}
