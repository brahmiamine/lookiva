import { AppError } from '@/platform/http/errors';
import type { OwnerId } from '@/platform/kernel';
import { MAX_OUTFIT_ITEMS, type OutfitStatus } from '../domain/outfit';

export type OutfitItemView = { garmentId: string; name: string; categoryCode: string; colorCode: string };
export type OutfitView = { id: string; name: string | null; status: OutfitStatus; version: number; wearRecordId: string | null; items: OutfitItemView[]; createdAt: string; updatedAt: string };

export type CreateOutfitInput = { name: string | null; garmentIds: string[] };
export type ConfirmResult = { kind: 'OK'; outfit: OutfitView } | { kind: 'NOT_FOUND' } | { kind: 'ALREADY_WORN'; wearRecordId: string } | { kind: 'CANCELLED' } | { kind: 'GARMENT_UNAVAILABLE'; garmentIds: string[] };

/** Persistence port. Each method is one transaction; confirmWorn writes the snapshot and the status together, and never touches a garment row. */
export type OutfitStore = {
  create(owner: OwnerId, input: CreateOutfitInput, now: Date, id: string): Promise<OutfitView | null>;
  get(owner: OwnerId, id: string): Promise<OutfitView | null>;
  confirmWorn(owner: OwnerId, id: string, now: Date, wearRecordId: string, newId: () => string): Promise<ConfirmResult>;
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

    /** Confirms a wear: one WearRecord snapshot, outfit WORN. Returns the outcome for the HTTP layer to map. */
    confirmWorn(owner: OwnerId, id: string): Promise<ConfirmResult> {
      return outfits.confirmWorn(owner, id, now(), newId(), newId);
    },
  };
}

export type OutfitService = ReturnType<typeof createOutfitService>;
