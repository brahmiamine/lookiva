import { AppError } from '@/platform/http/errors';
import { assertIfMatch } from '@/platform/http/etag';
import type { OwnerId } from '@/platform/kernel';
import { MAX_OUTFIT_ITEMS, planningError, type OutfitStatus, type PlanTarget } from '../domain/outfit';

export type OutfitItemView = { garmentId: string; name: string; categoryCode: string; colorCode: string };
export type OutfitView = { id: string; name: string | null; status: OutfitStatus; plannedFor: string | null; occasion: string | null; version: number; wearRecordId: string | null; items: OutfitItemView[]; createdAt: string; updatedAt: string };
export type OutfitPatch = { name?: string | null; occasion?: string | null; plannedFor?: Date | null; status?: PlanTarget };
export type OutfitFilter = { from?: Date; to?: Date; status?: OutfitStatus };
export type MarkResult = { kind: 'OK'; changedIds: string[]; unchangedIds: string[] } | { kind: 'NOT_FOUND' } | { kind: 'NOT_IN_WEAR'; garmentIds: string[] } | { kind: 'GARMENT_UNAVAILABLE'; garmentIds: string[] };
export type WearView = { wearRecordId: string; wornAt: string; outfitId: string | null };

export type CreateOutfitInput = { name: string | null; garmentIds: string[] };
export type ConfirmResult = { kind: 'OK'; outfit: OutfitView } | { kind: 'NOT_FOUND' } | { kind: 'ALREADY_WORN'; wearRecordId: string } | { kind: 'CANCELLED' } | { kind: 'GARMENT_UNAVAILABLE'; garmentIds: string[] };

/** Persistence port. Each method is one transaction; confirmWorn writes the snapshot and the status together, and never touches a garment row. */
export type OutfitStore = {
  create(owner: OwnerId, input: CreateOutfitInput, now: Date, id: string): Promise<OutfitView | null>;
  get(owner: OwnerId, id: string): Promise<OutfitView | null>;
  confirmWorn(owner: OwnerId, id: string, now: Date, wearRecordId: string, newId: () => string): Promise<ConfirmResult>;
  list(owner: OwnerId, filter: OutfitFilter): Promise<OutfitView[]>;
  /** Confirmed wears that included this garment, most recent first (snapshot rows; the garment itself is not read). */
  wearsOf(owner: OwnerId, garmentId: string): Promise<WearView[]>;
  /** Optional laundry step: only the listed garments of this wear move to TO_WASH; the wear record is never touched. */
  markToWash(owner: OwnerId, wearRecordId: string, garmentIds: string[], now: Date, newId: () => string): Promise<MarkResult>;
  /** Version-guarded: null when the row changed since `expectedVersion` (the caller maps it to 409). */
  update(owner: OwnerId, id: string, expectedVersion: number, patch: OutfitPatch, now: Date): Promise<OutfitView | null>;
};

export type OutfitServiceDeps = { outfits: OutfitStore; now: () => Date; newId: () => string };

export function createOutfitService({ outfits, now, newId }: OutfitServiceDeps) {
  return {
    async create(owner: OwnerId, input: CreateOutfitInput): Promise<OutfitView> {
      if (new Set(input.garmentIds).size !== input.garmentIds.length) throw new AppError('VALIDATION_ERROR', 400, 'Validation failed', [{ path: 'garmentIds', message: 'garment ids must be unique' }]);
      if (input.garmentIds.length > MAX_OUTFIT_ITEMS) throw new AppError('VALIDATION_ERROR', 400, 'Validation failed', [{ path: 'garmentIds', message: `at most ${MAX_OUTFIT_ITEMS} garments` }]);
      const created = await outfits.create(owner, input, now(), newId());
      // A garment that is missing, trashed or another user's is refused as one unknown item, so nothing leaks.
      if (!created) throw new AppError('NOT_FOUND', 404, 'Some garments were not found; nothing was created');
      return created;
    },

    async get(owner: OwnerId, id: string): Promise<OutfitView> {
      const found = await outfits.get(owner, id);
      if (!found) throw new AppError('NOT_FOUND', 404, 'outfit not found');
      return found;
    },

    /** Laundry is always explicit: the caller lists the garments, nothing is ticked by default. */
    async markToWash(owner: OwnerId, wearRecordId: string, garmentIds: string[]): Promise<MarkResult> {
      if (garmentIds.length === 0) throw new AppError('VALIDATION_ERROR', 400, 'Validation failed', [{ path: 'garmentIds', message: 'choose at least one garment' }]);
      return outfits.markToWash(owner, wearRecordId, garmentIds, now(), newId);
    },

    wearsOf(owner: OwnerId, garmentId: string): Promise<WearView[]> {
      return outfits.wearsOf(owner, garmentId);
    },

    list(owner: OwnerId, filter: OutfitFilter): Promise<OutfitView[]> {
      return outfits.list(owner, filter);
    },

    /** Planning change: DRAFT or PLANNED only, If-Match on the version the caller read. */
    async update(owner: OwnerId, id: string, ifMatch: string | null, patch: OutfitPatch): Promise<OutfitView> {
      const current = await this.get(owner, id);
      assertIfMatch(ifMatch, current.version);
      const plannedFor = patch.plannedFor !== undefined ? patch.plannedFor : current.plannedFor ? new Date(current.plannedFor) : null;
      const refusal = planningError(current.status, patch.status ?? null, plannedFor);
      if (refusal) throw new AppError(refusal, 409, refusal === 'OUTFIT_LOCKED' ? 'this outfit can no longer be planned' : 'a planned outfit needs a start time');
      const updated = await outfits.update(owner, id, current.version, patch, now());
      if (!updated) throw new AppError('VERSION_CONFLICT', 409, 'Resource version does not match If-Match');
      return updated;
    },

    /** Confirms a wear: one WearRecord snapshot, outfit WORN. Returns the outcome for the HTTP layer to map. */
    confirmWorn(owner: OwnerId, id: string): Promise<ConfirmResult> {
      return outfits.confirmWorn(owner, id, now(), newId(), newId);
    },
  };
}

export type OutfitService = ReturnType<typeof createOutfitService>;
