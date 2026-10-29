import { describe, expect, it } from 'vitest';
import { canConfirmWorn, planningError, snapshotName } from '@/modules/wardrobe/domain/outfit';

describe('outfit wear rules', () => {
  it('only_draft_or_planned_can_be_confirmed_worn', () => {
    expect(canConfirmWorn('DRAFT')).toBe(true);
    expect(canConfirmWorn('PLANNED')).toBe(true);
    expect(canConfirmWorn('WORN')).toBe(false); // a worn look never goes back: wearing it again is a new outfit
    expect(canConfirmWorn('CANCELLED')).toBe(false);
  });

  it('snapshot_name_prefers_nickname_then_custom_then_subtype_then_category', () => {
    const base = { customLabel: null, subtypeCode: 'TSHIRT', categoryCode: 'TOP' };
    expect(snapshotName({ ...base, nickname: 'Blue tee' })).toBe('Blue tee');
    expect(snapshotName({ ...base, nickname: null, customLabel: 'Marcel' })).toBe('Marcel');
    expect(snapshotName({ ...base, nickname: null })).toBe('TSHIRT');
    expect(snapshotName({ customLabel: null, subtypeCode: null, nickname: null, categoryCode: 'TOP' })).toBe('TOP');
  });

  it('planning_is_refused_once_worn_or_cancelled_and_planned_needs_a_start', () => {
    const at = new Date('2026-11-02T18:00:00Z');
    expect(planningError('DRAFT', 'PLANNED', at)).toBeNull();
    expect(planningError('DRAFT', 'PLANNED', null)).toBe('PLANNED_NEEDS_START');
    expect(planningError('PLANNED', 'CANCELLED', null)).toBeNull();
    expect(planningError('WORN', 'PLANNED', at)).toBe('OUTFIT_LOCKED');
    expect(planningError('CANCELLED', null, at)).toBe('OUTFIT_LOCKED');
  });
});
