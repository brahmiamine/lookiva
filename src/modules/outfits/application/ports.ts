import type { OwnerId, Page } from '@/platform/kernel';
import type { Role } from '../domain/roles';
import type { OutfitStatus, WearStatus } from '../domain/outfit';

export type ItemInput = { garmentId: string; role: Role };
export type ItemView = ItemInput & { position: number };

/** Schedule columns of an outfit (all null while a draft is incomplete). Dates are UTC; the local fields are the wall clock in `timezone`. */
export type Schedule = { startsAt: Date | null; endsAt: Date | null; localDate: string | null; localTime: string | null; timezone: string | null };
export type OutfitData = Schedule & { title: string | null; occasion: string | null; status: OutfitStatus };

export type OutfitView = {
  id: string;
  title: string | null;
  status: OutfitStatus;
  occasion: string | null;
  startsAt: string | null;
  endsAt: string | null;
  localDate: string | null;
  localTime: string | null;
  timezone: string | null;
  items: ItemView[];
  activeWearRecordId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type Snapshot = {
  nickname: string | null;
  categoryCode: string;
  subtypeCode: string | null;
  customSubtypeLabel: string | null;
  primaryColorCode: string;
  extraColorCodes: string[];
};
export type WearItemView = { garmentId: string | null; role: Role; position: number; snapshot: Snapshot };
export type WearRecordView = {
  id: string;
  outfitId: string;
  title: string | null;
  occasion: string | null;
  status: WearStatus;
  confirmedAt: string;
  localDate: string;
  localTime: string;
  timezone: string;
  items: WearItemView[];
  version: number;
  invalidatedAt: string | null;
  invalidationReason: string | null;
};
export type WearRecordData = { id: string; confirmedAt: Date; localDate: string; localTime: string; timezone: string; items: (ItemView & { snapshot: Snapshot })[] };
export type GarmentWearEntry = { wearRecordId: string; outfitId: string; localDate: string; localTime: string; timezone: string; confirmedAt: string; role: Role; title: string | null; occasion: string | null; snapshot: Snapshot };

export type ConfirmResult = { ok: true; outfit: OutfitView; record: WearRecordView } | { ok: false; code: 'ALREADY_WORN' | 'VERSION_CONFLICT' | 'NOT_CONFIRMABLE' };
/** Another open outfit of the same owner that shares garments with the one being checked. */
export type Neighbor = { outfitId: string; title: string | null; status: OutfitStatus; startsAt: Date; endsAt: Date | null; localDate: string; garmentIds: string[] };

export interface OutfitStore {
  findById(ownerId: OwnerId, id: string): Promise<OutfitView | null>;
  create(ownerId: OwnerId, data: OutfitData, items: ItemInput[], now: Date): Promise<OutfitView>;
  /** Compare-and-set on `expectedVersion`, only while DRAFT/PLANNED; `items` (when given) replaces the composition. null = moved or not editable. */
  update(ownerId: OwnerId, id: string, expectedVersion: number, data: Partial<OutfitData>, items: ItemInput[] | undefined, now: Date): Promise<OutfitView | null>;
  list(ownerId: OwnerId, p: { limit: number; cursor?: { id: string }; status?: OutfitStatus }): Promise<Page<OutfitView>>;
  /** Outfits whose localDate lies in [from, to] (YYYY-MM-DD), chronological. Up to 201 rows (the caller flags truncation). */
  range(ownerId: OwnerId, from: string, to: string, status?: OutfitStatus): Promise<OutfitView[]>;
  /** Open outfits sharing a garment whose start lies in [from, to], by start. */
  neighbors(ownerId: OwnerId, outfitId: string, garmentIds: string[], from: Date, to: Date): Promise<Neighbor[]>;
  /** ONE transaction: outfit -> WORN (CAS on version and DRAFT/PLANNED) + WearRecord + snapshots. Never touches a garment. */
  confirm(ownerId: OwnerId, id: string, expectedVersion: number, rec: WearRecordData, now: Date): Promise<ConfirmResult>;
}

export interface WearStore {
  findById(ownerId: OwnerId, id: string): Promise<WearRecordView | null>;
  /** CAS on the record version while ACTIVE; frees the outfit (back to PLANNED/DRAFT, version+1) in the same transaction. null = moved. */
  invalidate(ownerId: OwnerId, id: string, expectedVersion: number, reason: string, now: Date): Promise<WearRecordView | null>;
  lastWorn(ownerId: OwnerId, limit: number): Promise<WearRecordView[]>;
  /** Newest first, ACTIVE records only, one entry per local date. */
  garmentHistory(ownerId: OwnerId, garmentId: string, limit: number): Promise<GarmentWearEntry[]>;
}

export type TemplateView = { id: string; name: string; occasion: string | null; items: ItemView[]; version: number; createdAt: string; updatedAt: string };
export interface TemplateStore {
  findById(ownerId: OwnerId, id: string): Promise<TemplateView | null>;
  create(ownerId: OwnerId, d: { name: string; occasion: string | null }, items: ItemInput[], now: Date): Promise<TemplateView>;
  update(ownerId: OwnerId, id: string, expectedVersion: number, d: { name?: string; occasion?: string | null }, items: ItemInput[] | undefined, now: Date): Promise<TemplateView | null>;
  list(ownerId: OwnerId, p: { limit: number; cursor?: { id: string } }): Promise<Page<TemplateView>>;
  remove(ownerId: OwnerId, id: string): Promise<boolean>;
}
