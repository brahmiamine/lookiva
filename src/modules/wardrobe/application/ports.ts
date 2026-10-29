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
  changeStatus(ownerId: OwnerId, id: string, expectedVersion: number, to: GarmentStatus, note: string | null, now: Date): Promise<GarmentView | null>;
  softDelete(ownerId: OwnerId, id: string, now: Date): Promise<boolean>;
  listStatusEvents(ownerId: OwnerId, garmentId: string, page: PageArg): Promise<Page<StatusEventView>>;
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
