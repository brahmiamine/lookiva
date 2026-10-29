import { afterAll, describe, expect, it } from 'vitest';
import type { GarmentGateway } from '@/modules/wardrobe';
import { closeAll, db, outfitsHarness, UNKNOWN, type Json } from './harness';

afterAll(closeAll);

const TZ = 'Europe/Paris';
const at = (hhmm: string, day = '2026-11-03') => `${day}T${hhmm}:00+01:00`;
const etag = (r: { headers: Headers }) => r.headers.get('etag') as string;
const plan = (extra: Json = {}): Json => ({ status: 'PLANNED', occasion: 'Work', startsAt: at('08:00'), timezone: TZ, ...extra });

async function setup(opts?: Parameters<typeof outfitsHarness>[0]) {
  const h = outfitsHarness(opts);
  const u = await h.user();
  const other = await h.user();
  const [top, bottom, shoes, coat] = [await u.garment({ nickname: 'Top' }), await u.garment({ nickname: 'Bottom' }), await u.garment({ nickname: 'Shoes' }), await u.garment({ nickname: 'Coat' })];
  const items = [{ garmentId: top.id, role: 'TOP' }, { garmentId: bottom.id, role: 'BOTTOM' }, { garmentId: shoes.id, role: 'SHOES' }, { garmentId: coat.id, role: 'OUTERWEAR' }];
  const statusOf = async (g: Json) => (await h.api.getGarment(u.cookie, g.id)).body as Json;
  const planned = async (extra: Json = {}, its = items) => (await h.o.create(u.cookie, plan({ items: its, ...extra }))).body as Json;
  return { h, u, other, cookie: u.cookie, ocookie: other.cookie, top, bottom, shoes, coat, items, statusOf, planned };
}

describe('outfits: planning', () => {
  it('three_outfits_on_the_same_day_keep_independent_statuses_and_a_chronological_order', async () => {
    const { h, cookie, planned, items } = await setup();
    const evening = await planned({ occasion: 'Dinner', startsAt: at('20:00') });
    const morning = await planned({ occasion: 'Work', startsAt: at('08:00') });
    const noon = (await h.o.create(cookie, { title: 'Lunch idea', items: items.slice(0, 2) })).body as Json; // draft, no date
    const noonPlanned = await h.o.patch(cookie, noon.id, { status: 'PLANNED', occasion: 'Lunch', startsAt: at('12:30'), timezone: TZ }, 'W/"v1"');
    expect(noonPlanned.status).toBe(200);
    await h.o.cancel(cookie, evening.id);
    expect((await h.o.confirm(cookie, morning.id, { expectedVersion: 1 })).status).toBe(201);

    const day = await h.o.list(cookie, '?from=2026-11-03&to=2026-11-03');
    expect((day.body?.items as Json[]).map((o) => [o.occasion, o.status, o.localTime])).toEqual([['Work', 'WORN', '08:00'], ['Lunch', 'PLANNED', '12:30'], ['Dinner', 'CANCELLED', '20:00']]);
    expect((await h.o.list(cookie, '?from=2026-11-04&to=2026-11-10')).body?.items).toEqual([]);
    expect(((await h.o.list(cookie, '?from=2026-11-03&to=2026-11-03&status=PLANNED')).body?.items as Json[]).length).toBe(1);
  });

  it('a_draft_may_be_incomplete_and_planning_needs_start_zone_and_occasion', async () => {
    const { h, cookie } = await setup();
    const draft = await h.o.create(cookie, {});
    expect(draft.status).toBe(201);
    expect(draft.body).toMatchObject({ status: 'DRAFT', items: [], startsAt: null, localDate: null, version: 1 });
    expect(etag(draft)).toBe('W/"v1"');
    const bad = await h.o.create(cookie, { status: 'PLANNED' });
    expect(bad.status).toBe(400);
    expect((bad.body?.errors as Json[]).map((e) => e.path).sort()).toEqual(['occasion', 'startsAt']);
    expect((await h.o.create(cookie, { startsAt: at('08:00') })).body).toMatchObject({ status: 400 }); // zone missing
    expect((await h.o.create(cookie, { startsAt: at('08:00'), timezone: 'Mars/Base' })).status).toBe(400);
    expect((await h.o.create(cookie, { startsAt: at('08:00'), endsAt: at('07:00'), timezone: TZ })).status).toBe(400);
    expect((await h.o.create(cookie, { startsAt: '2026-11-03T08:00:00', timezone: TZ })).status).toBe(400); // no offset
    const p = await h.o.patch(cookie, draft.body?.id as string, { status: 'PLANNED' }, etag(draft));
    expect(p.status).toBe(400);
  });

  it('derives_local_date_time_and_zone_and_warns_about_missing_roles_without_blocking', async () => {
    const { h, cookie, top } = await setup();
    const r = await h.o.create(cookie, plan({ startsAt: '2026-11-02T23:30:00Z', items: [{ garmentId: top.id, role: 'TOP' }] }));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'PLANNED', startsAt: '2026-11-02T23:30:00.000Z', localDate: '2026-11-03', localTime: '00:30', timezone: TZ });
    expect((r.body?.warnings as Json[]).map((w) => [w.code, w.role])).toEqual([['MISSING_ROLE', 'BOTTOM'], ['MISSING_ROLE', 'SHOES']]);
    expect((await h.o.get(cookie, r.body?.id as string)).body?.warnings).toHaveLength(2);
  });

  it('items_add_remove_replace_with_ownership_uniqueness_and_availability_warnings', async () => {
    const { h, cookie, top, bottom, shoes, other, u } = await setup();
    const o = await h.o.create(cookie, plan({ items: [{ garmentId: top.id, role: 'TOP' }] }));
    let tag = etag(o);
    const added = await h.o.addItem(cookie, o.body?.id as string, { garmentId: bottom.id, role: 'BOTTOM' }, tag);
    expect(added.status).toBe(201);
    tag = etag(added);
    expect((added.body?.items as Json[]).map((i) => [i.garmentId, i.position])).toEqual([[top.id, 0], [bottom.id, 1]]);
    expect((await h.o.addItem(cookie, o.body?.id as string, { garmentId: bottom.id, role: 'BOTTOM' }, tag)).body).toMatchObject({ code: 'GARMENT_ALREADY_IN_OUTFIT' });
    expect((await h.o.addItem(cookie, o.body?.id as string, { garmentId: bottom.id, role: 'BOTTOM' })).status).toBe(428);
    expect((await h.o.addItem(cookie, o.body?.id as string, { garmentId: shoes.id, role: 'SHOES' }, 'W/"v1"')).body).toMatchObject({ code: 'VERSION_CONFLICT' });
    // foreign, unknown and trashed garments are the same 404, nothing changes
    const foreign = await other.garment();
    const trashed = await u.garment();
    await h.api.deleteGarment(cookie, trashed.id);
    const a = await h.o.addItem(cookie, o.body?.id as string, { garmentId: foreign.id, role: 'OTHER' }, tag);
    const b = await h.o.addItem(cookie, o.body?.id as string, { garmentId: UNKNOWN, role: 'OTHER' }, tag);
    expect([a.status, b.status]).toEqual([404, 404]);
    expect((await h.o.addItem(cookie, o.body?.id as string, { garmentId: trashed.id, role: 'OTHER' }, tag)).status).toBe(404);
    expect((await h.o.get(cookie, o.body?.id as string)).body).toMatchObject({ version: 2 });
    // replace + remove
    const rep = await h.o.replaceItem(cookie, o.body?.id as string, bottom.id, { garmentId: shoes.id, role: 'SHOES' }, tag);
    expect((rep.body?.items as Json[]).map((i) => [i.garmentId, i.role])).toEqual([[top.id, 'TOP'], [shoes.id, 'SHOES']]);
    const rem = await h.o.removeItem(cookie, o.body?.id as string, top.id, etag(rep));
    expect((rem.body?.items as Json[]).map((i) => i.garmentId)).toEqual([shoes.id]);
    expect((await h.o.removeItem(cookie, o.body?.id as string, top.id, etag(rem))).status).toBe(404);
    // a LENT garment is a warning, not an error
    await h.api.setStatus(cookie, bottom.id, { status: 'LENT' }, 'W/"v1"');
    const lent = await h.o.addItem(cookie, o.body?.id as string, { garmentId: bottom.id, role: 'BOTTOM' }, etag(rem));
    expect(lent.status).toBe(201);
    expect(lent.body?.warnings).toContainEqual({ code: 'GARMENT_UNAVAILABLE', garmentId: bottom.id, status: 'LENT' });
    // the whole composition can be replaced through PATCH too
    const full = await h.o.patch(cookie, o.body?.id as string, { items: [{ garmentId: top.id, role: 'TOP' }] }, etag(lent));
    expect((full.body?.items as Json[]).length).toBe(1);
  });

  it('cancel_is_a_status_not_a_delete_and_closed_outfits_are_not_editable', async () => {
    const { h, cookie, planned } = await setup();
    const o = await planned();
    expect((await h.o.cancel(cookie, o.id)).status).toBe(204);
    expect((await h.o.cancel(cookie, o.id)).status).toBe(204); // idempotent
    const got = await h.o.get(cookie, o.id);
    expect(got.body).toMatchObject({ status: 'CANCELLED' });
    expect(got.body?.items).toHaveLength(4);
    expect((await h.o.patch(cookie, o.id, { title: 'x' }, etag(got))).body).toMatchObject({ code: 'OUTFIT_NOT_EDITABLE' });
    expect((await h.o.confirm(cookie, o.id, { expectedVersion: got.body?.version })).body).toMatchObject({ code: 'OUTFIT_NOT_EDITABLE' });
  });

  it('garments_in_draft_or_planned_outfits_produce_warnings_on_trash_and_bulk_delete', async () => {
    const { h, cookie, planned, top, bottom } = await setup();
    await planned();
    const del = await h.api.deleteGarment(cookie, top.id);
    expect(del.status).toBe(200);
    expect(del.body?.warnings).toEqual([{ garmentId: top.id, kind: 'IN_ACTIVE_OUTFITS', count: 1 }]);
    const bulk = await h.api.bulk(cookie, { action: 'DELETE', ids: [bottom.id] });
    expect(bulk.body?.warnings).toEqual([{ garmentId: bottom.id, kind: 'IN_ACTIVE_OUTFITS', count: 1 }]);
  });
});

describe('outfits: conflicts', () => {
  it('certain_overlap_possible_overlap_and_no_conflict_never_block_planning', async () => {
    const { h, cookie, top, bottom, shoes } = await setup();
    const mk = (extra: Json) => h.o.create(cookie, plan(extra)).then((r) => r.body as Json);
    const a = await mk({ startsAt: at('09:00'), endsAt: at('12:00'), items: [{ garmentId: top.id, role: 'TOP' }] });
    const b = await mk({ startsAt: at('11:00'), endsAt: at('14:00'), occasion: 'Lunch', items: [{ garmentId: top.id, role: 'TOP' }, { garmentId: bottom.id, role: 'BOTTOM' }] });
    const c = await mk({ startsAt: at('07:00'), occasion: 'Early', items: [{ garmentId: top.id, role: 'TOP' }] }); // no end, may still run when a starts
    const c2 = await mk({ startsAt: at('18:00'), occasion: 'Dinner', items: [{ garmentId: top.id, role: 'TOP' }] }); // no end, starts after a ended
    const d = await mk({ startsAt: at('09:00', '2026-11-04'), occasion: 'Next day', items: [{ garmentId: top.id, role: 'TOP' }] });
    const e = await mk({ startsAt: at('09:00'), occasion: 'Other garment', items: [{ garmentId: shoes.id, role: 'SHOES' }] });
    const ca = (await h.o.conflicts(cookie, a.id)).body?.conflicts as Json[];
    expect(ca.filter((x) => x.otherOutfitId === b.id)).toEqual([{ kind: 'OVERLAP_CERTAIN', garmentId: top.id, otherOutfitId: b.id, suggestions: expect.any(Array) }]);
    expect(ca.find((x) => x.otherOutfitId === c.id)).toMatchObject({ kind: 'OVERLAP_POSSIBLE', garmentId: top.id });
    expect(ca.some((x) => [c2.id, d.id, e.id].includes(x.otherOutfitId))).toBe(false); // other day / other garment
    // c2 (open ended) vs d (next day): nothing; both outfits stay PLANNED
    expect(((await h.o.conflicts(cookie, c2.id)).body?.conflicts as Json[]).some((x) => x.otherOutfitId === d.id)).toBe(false);
    expect((await h.o.get(cookie, a.id)).body).toMatchObject({ status: 'PLANNED' });
  });

  it('unavailable_garments_are_explained_with_available_same_category_replacements', async () => {
    const { h, cookie, u, top, planned } = await setup();
    const spare = await u.garment({ nickname: 'Spare shirt' });
    const o = await planned({}, [{ garmentId: top.id, role: 'TOP' }]);
    await h.api.setStatus(cookie, top.id, { status: 'IN_REPAIR' }, 'W/"v1"');
    const res = (await h.o.conflicts(cookie, o.id)).body?.conflicts as Json[];
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ kind: 'GARMENT_UNAVAILABLE', garmentId: top.id, status: 'IN_REPAIR' });
    expect(res[0]?.suggestions).toContain(spare.id);
    expect(res[0]?.suggestions).not.toContain(top.id);
    // still confirmable: conflicts never block
    expect((await h.o.confirm(cookie, o.id, { expectedVersion: 1 })).status).toBe(201);
    expect((await h.o.conflicts(cookie, o.id)).body?.conflicts).toEqual([]); // worn outfits have no planning conflicts
  });
});

describe('confirm-worn', () => {
  it('creates_exactly_one_snapshot_and_changes_no_garment_status_nor_version', async () => {
    const { h, cookie, planned, top, bottom, shoes, coat, statusOf } = await setup();
    const o = await planned();
    const before = await Promise.all([top, bottom, shoes, coat].map(statusOf));
    const r = await h.o.confirm(cookie, o.id, { expectedVersion: 1 });
    expect(r.status).toBe(201);
    expect(r.body?.outfit).toMatchObject({ status: 'WORN', version: 2 });
    const rec = r.body?.wearRecord as Json;
    expect(rec).toMatchObject({ outfitId: o.id, status: 'ACTIVE', timezone: TZ, occasion: 'Work', version: 1 });
    expect(rec.items).toHaveLength(4);
    expect(rec.items[0]).toMatchObject({ garmentId: top.id, role: 'TOP', snapshot: { nickname: 'Top', categoryCode: 'TOPS', subtypeCode: 'SHIRT', primaryColorCode: 'BLUE', extraColorCodes: [] } });
    expect(JSON.stringify(rec)).not.toMatch(/photo|Key/i);
    expect(await db.wearRecord.count({ where: { outfitId: o.id } })).toBe(1);
    expect(await db.wearRecordItem.count({ where: { wearRecordId: rec.id } })).toBe(4);
    expect(await Promise.all([top, bottom, shoes, coat].map(statusOf))).toEqual(before);
    expect(await db.garmentStatusEvent.count({ where: { garmentId: { in: [top.id, bottom.id, shoes.id, coat.id] } } })).toBe(4); // creation events only
    expect((await h.o.wear(cookie, rec.id)).body).toMatchObject({ id: rec.id });
    expect((await h.o.get(cookie, o.id)).body).toMatchObject({ status: 'WORN', activeWearRecordId: rec.id });
  });

  it('a_second_confirmation_is_409_already_worn_and_the_same_key_replays_the_first_result', async () => {
    const { h, cookie, planned } = await setup();
    const o = await planned();
    const k = h.idem();
    const first = await h.o.confirm(cookie, o.id, { expectedVersion: 1 }, k);
    const replay = await h.o.confirm(cookie, o.id, { expectedVersion: 1 }, k);
    expect(replay.status).toBe(201);
    expect((replay.body?.wearRecord as Json).id).toBe((first.body?.wearRecord as Json).id);
    const second = await h.o.confirm(cookie, o.id, { expectedVersion: 1 });
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ code: 'ALREADY_WORN' });
    expect((await h.o.confirm(cookie, o.id, { expectedVersion: 5 }, k)).status).toBe(422); // same key, other request
    expect(await db.wearRecord.count({ where: { outfitId: o.id } })).toBe(1);
  });

  it('concurrent_confirmations_have_exactly_one_winner', async () => {
    const { h, cookie, planned } = await setup();
    for (let round = 0; round < 4; round++) {
      const o = await planned({ startsAt: at('08:00', `2026-12-0${round + 1}`) });
      const rs = await Promise.all(Array.from({ length: 6 }, () => h.o.confirm(cookie, o.id, { expectedVersion: 1 })));
      expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
      for (const r of rs.filter((x) => x.status !== 201)) expect(['ALREADY_WORN', 'VERSION_CONFLICT']).toContain(r.body?.code);
      expect(await db.wearRecord.count({ where: { outfitId: o.id } })).toBe(1);
      expect(await db.wearRecordItem.count({ where: { wearRecord: { outfitId: o.id } } })).toBe(4);
    }
  });

  it('validates_version_items_and_zone', async () => {
    const { h, cookie } = await setup();
    const empty = (await h.o.create(cookie, plan())).body as Json;
    expect((await h.o.confirm(cookie, empty.id, { expectedVersion: 1 })).status).toBe(400);
    expect((await h.o.confirm(cookie, empty.id, { expectedVersion: 9 })).body).toMatchObject({ code: 'VERSION_CONFLICT' });
    expect((await h.o.confirm(cookie, empty.id, {})).status).toBe(400);
    expect((await h.o.confirm(cookie, empty.id, { expectedVersion: 1 }, {})).body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  });

  it('invalidate_frees_the_outfit_for_reconfirmation_and_keeps_the_audited_record', async () => {
    const { h, cookie, planned } = await setup();
    const o = await planned();
    const c1 = (await h.o.confirm(cookie, o.id, { expectedVersion: 1 })).body as Json;
    const rec = c1.wearRecord as Json;
    expect((await h.o.invalidate(cookie, rec.id, { reason: 'x' })).status).toBe(428);
    expect((await h.o.invalidate(cookie, rec.id, {}, 'W/"v1"')).status).toBe(400);
    const inv = await h.o.invalidate(cookie, rec.id, { reason: 'Finally wore something else' }, 'W/"v1"');
    expect(inv.status).toBe(200);
    expect(inv.body).toMatchObject({ status: 'INVALIDATED', invalidationReason: 'Finally wore something else', version: 2, invalidatedAt: expect.any(String) });
    expect(inv.body?.items).toEqual(rec.items); // snapshot kept, immutable
    expect((await h.o.invalidate(cookie, rec.id, { reason: 'again' }, etag(inv))).body).toMatchObject({ code: 'ALREADY_INVALIDATED' });
    expect((await h.o.lastWorn(cookie)).body?.items).toEqual([]); // excluded from histories
    const back = await h.o.get(cookie, o.id);
    expect(back.body).toMatchObject({ status: 'PLANNED', version: 3, activeWearRecordId: null });
    const c2 = await h.o.confirm(cookie, o.id, { expectedVersion: 3 });
    expect(c2.status).toBe(201);
    expect((c2.body?.wearRecord as Json).id).not.toBe(rec.id);
    expect(await db.wearRecord.count({ where: { outfitId: o.id } })).toBe(2);
    expect(await db.wearRecord.count({ where: { outfitId: o.id, status: 'ACTIVE' } })).toBe(1);
    // the DB itself refuses a second ACTIVE record
    await expect(db.wearRecord.create({ data: { id: UNKNOWN, ownerId: (await db.outfit.findFirstOrThrow({ where: { id: o.id } })).ownerId, outfitId: o.id, activeSlot: 1, confirmedAt: new Date(), localDate: new Date(), localTime: '00:00', timezone: 'UTC', createdAt: new Date() } })).rejects.toThrow();
  });
});

describe('mark-to-wash', () => {
  const confirmed = async (s: Awaited<ReturnType<typeof setup>>) => {
    const o = await s.planned();
    const r = await s.h.o.confirm(s.cookie, o.id, { expectedVersion: 1 });
    return (r.body?.wearRecord as Json).id as string;
  };

  it('two_of_four_move_to_wash_with_a_wear_record_event_and_the_others_stay_intact', async () => {
    const s = await setup();
    const rec = await confirmed(s);
    const res = await s.h.o.wash(s.cookie, rec, { garmentIds: [s.top.id, s.shoes.id] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ wearRecordId: rec, marked: [s.top.id, s.shoes.id], skipped: [], failed: [] });
    expect(await s.statusOf(s.top)).toMatchObject({ status: 'TO_WASH', version: 2 });
    expect(await s.statusOf(s.shoes)).toMatchObject({ status: 'TO_WASH', version: 2 });
    for (const g of [s.bottom, s.coat]) expect(await s.statusOf(g)).toMatchObject({ status: 'AVAILABLE', version: 1 });
    const ev = ((await s.h.api.history(s.cookie, s.top.id)).body?.items as Json[])[0];
    expect(ev).toMatchObject({ fromStatus: 'AVAILABLE', toStatus: 'TO_WASH', source: 'WEAR_RECORD', note: rec });
    expect((await s.h.o.wear(s.cookie, rec)).body).toMatchObject({ status: 'ACTIVE' });
  });

  it('ignoring_the_proposal_leaves_every_state_and_an_empty_subset_is_a_noop', async () => {
    const s = await setup();
    const rec = await confirmed(s); // no wash call at all
    for (const g of [s.top, s.bottom, s.shoes, s.coat]) expect(await s.statusOf(g)).toMatchObject({ status: 'AVAILABLE', version: 1 });
    const res = await s.h.o.wash(s.cookie, rec, { garmentIds: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ wearRecordId: rec, marked: [], skipped: [], failed: [] });
    expect(await s.statusOf(s.top)).toMatchObject({ status: 'AVAILABLE', version: 1 });
  });

  it('garments_not_available_are_skipped_untouched_and_foreign_or_other_record_ids_fail_alone', async () => {
    const s = await setup();
    const rec = await confirmed(s);
    await s.h.api.setStatus(s.cookie, s.bottom.id, { status: 'LENT' }, 'W/"v1"');
    const stranger = await s.u.garment();
    const foreign = await s.other.garment();
    const res = await s.h.o.wash(s.cookie, rec, { garmentIds: [s.bottom.id, stranger.id, foreign.id, s.top.id], expectedVersions: { [s.top.id]: 1 } });
    expect(res.body).toEqual({
      wearRecordId: rec,
      marked: [s.top.id],
      skipped: [{ garmentId: s.bottom.id, status: 'LENT', reason: 'NOT_AVAILABLE' }],
      failed: [{ garmentId: stranger.id, code: 'NOT_IN_RECORD' }, { garmentId: foreign.id, code: 'NOT_IN_RECORD' }],
    });
    expect(await s.statusOf(s.bottom)).toMatchObject({ status: 'LENT', version: 2 });
    expect((await s.h.api.getGarment(s.ocookie, foreign.id as string)).body).toMatchObject({ status: 'AVAILABLE', version: 1 });
    const stale = await s.h.o.wash(s.cookie, rec, { garmentIds: [s.shoes.id], expectedVersions: { [s.shoes.id]: 7 } });
    expect(stale.body).toMatchObject({ marked: [], failed: [{ garmentId: s.shoes.id, code: 'VERSION_CONFLICT', currentVersion: 1 }] });
    expect((await s.h.o.wash(s.cookie, rec, { garmentIds: [s.top.id], expectedVersions: { [s.coat.id]: 1 } })).status).toBe(400);
  });

  it('a_failing_status_port_never_deletes_or_rolls_back_the_wear_record', async () => {
    let failId = '';
    const s = await setup({ wrap: (real): GarmentGateway => ({ ...real, setStatus: async (o, id, to, opt) => { if (id === failId) throw new Error('boom'); return real.setStatus(o, id, to, opt); } }) });
    const rec = await confirmed(s);
    failId = s.top.id as string;
    const res = await s.h.o.wash(s.cookie, rec, { garmentIds: [s.top.id, s.bottom.id] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ marked: [s.bottom.id], failed: [{ garmentId: s.top.id, code: 'STATUS_UPDATE_FAILED' }] });
    expect(await s.statusOf(s.top)).toMatchObject({ status: 'AVAILABLE', version: 1 });
    expect(await s.statusOf(s.bottom)).toMatchObject({ status: 'TO_WASH' });
    expect((await s.h.o.wear(s.cookie, rec)).body).toMatchObject({ status: 'ACTIVE' });
    expect((await s.h.o.get(s.cookie, (await db.wearRecord.findFirstOrThrow({ where: { id: rec } })).outfitId)).body).toMatchObject({ status: 'WORN' });
  });

  it('retrying_with_the_same_key_never_repeats_the_transition_and_an_invalidated_record_refuses', async () => {
    const s = await setup();
    const rec = await confirmed(s);
    const k = s.h.idem();
    const a = await s.h.o.wash(s.cookie, rec, { garmentIds: [s.top.id] }, k);
    const b = await s.h.o.wash(s.cookie, rec, { garmentIds: [s.top.id] }, k);
    expect(b.body).toEqual(a.body);
    expect(await s.statusOf(s.top)).toMatchObject({ status: 'TO_WASH', version: 2 });
    expect(await db.garmentStatusEvent.count({ where: { garmentId: s.top.id, source: 'WEAR_RECORD' } })).toBe(1);
    // another key afterwards: the garment is no longer AVAILABLE, so it is skipped, not moved twice
    const c = await s.h.o.wash(s.cookie, rec, { garmentIds: [s.top.id] });
    expect(c.body).toMatchObject({ marked: [], skipped: [{ garmentId: s.top.id, status: 'TO_WASH' }] });
    expect((await s.h.o.wash(s.cookie, rec, { garmentIds: [] }, {})).body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    await s.h.o.invalidate(s.cookie, rec, { reason: 'oops' }, 'W/"v1"');
    expect((await s.h.o.wash(s.cookie, rec, { garmentIds: [s.bottom.id] })).body).toMatchObject({ code: 'WEAR_RECORD_INVALIDATED' });
  });
});

describe('templates', () => {
  it('crud_and_instantiate_leave_the_template_and_earlier_outfits_untouched', async () => {
    const { h, cookie, items, top, planned } = await setup();
    const o = await planned();
    const saved = await h.o.saveAsTemplate(cookie, o.id, { name: 'Office day' });
    expect(saved.status).toBe(201);
    const t = saved.body as Json;
    expect(t).toMatchObject({ name: 'Office day', occasion: 'Work', version: 1 });
    expect((t.items as Json[]).map((i) => i.garmentId)).toEqual(items.map((i) => i.garmentId));
    expect((await h.o.get(cookie, o.id)).body).toMatchObject({ version: 1, status: 'PLANNED' });

    const inst = await h.o.instantiate(cookie, t.id, { startsAt: at('08:00', '2026-11-10'), timezone: TZ });
    expect(inst.status).toBe(201);
    expect(inst.body).toMatchObject({ title: 'Office day', occasion: 'Work', status: 'PLANNED', localDate: '2026-11-10' });
    expect(inst.body?.id).not.toBe(o.id);
    const again = await h.o.instantiate(cookie, t.id, { startsAt: at('08:00', '2026-11-11'), timezone: TZ, status: 'DRAFT', occasion: 'Other' });
    expect(again.body).toMatchObject({ status: 'DRAFT', occasion: 'Other' });
    // editing / confirming an instance never touches the template
    await h.o.patch(cookie, inst.body?.id as string, { items: [{ garmentId: top.id, role: 'TOP' }] }, etag(inst));
    expect((await h.o.tGet(cookie, t.id)).body).toMatchObject({ version: 1, items: t.items });
    expect((await h.o.instantiate(cookie, t.id, {})).status).toBe(400); // PLANNED needs a start
    expect((await h.o.get(cookie, o.id)).body).toMatchObject({ version: 1 });

    // update (If-Match), list, delete: outfits made from it stay
    const up = await h.o.tPatch(cookie, t.id, { name: 'Office', items: [{ garmentId: top.id, role: 'TOP' }] }, 'W/"v1"');
    expect(up.body).toMatchObject({ name: 'Office', version: 2 });
    expect((await h.o.tPatch(cookie, t.id, { name: 'x' }, 'W/"v1"')).status).toBe(409);
    expect((await h.o.tPatch(cookie, t.id, { name: 'x' })).status).toBe(428);
    expect(((await h.o.tList(cookie)).body?.items as Json[]).map((x) => x.id)).toEqual([t.id]);
    expect((await h.o.tDelete(cookie, t.id)).status).toBe(204);
    expect((await h.o.tGet(cookie, t.id)).status).toBe(404);
    expect((await h.o.get(cookie, inst.body?.id as string)).status).toBe(200);
  });

  it('a_template_has_no_date_and_rejects_foreign_or_duplicate_garments', async () => {
    const { h, cookie, other, top } = await setup();
    const foreign = await other.garment();
    expect((await h.o.tCreate(cookie, { name: 'x', items: [{ garmentId: foreign.id, role: 'TOP' }] })).status).toBe(404);
    expect((await h.o.tCreate(cookie, { name: 'x', items: [{ garmentId: top.id, role: 'TOP' }, { garmentId: top.id, role: 'BOTTOM' }] })).status).toBe(400);
    expect((await h.o.tCreate(cookie, { name: 'x', startsAt: at('08:00') })).status).toBe(400);
    const ok = await h.o.tCreate(cookie, { name: 'Draft look' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ occasion: null, items: [] });
  });
});

describe('history', () => {
  it('last_worn_and_per_garment_dates_come_from_active_snapshots_newest_first', async () => {
    const { h, cookie, planned, top, bottom } = await setup();
    const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'];
    const recs: string[] = [];
    for (const [i, d] of days.entries()) {
      h.clock.set(new Date(`${d}T10:00:00Z`));
      const o = await planned({ startsAt: at('08:00', d) }, [{ garmentId: top.id, role: 'TOP' }, ...(i % 2 ? [{ garmentId: bottom.id, role: 'BOTTOM' }] : [])]);
      recs.push(((await h.o.confirm(cookie, o.id, { expectedVersion: 1 })).body?.wearRecord as Json).id as string);
    }
    const last = (await h.o.lastWorn(cookie)).body?.items as Json[];
    expect(last.map((r) => r.localDate)).toEqual(['2026-11-04', '2026-11-03', '2026-11-02']);
    expect((await h.o.lastWorn(cookie, '?limit=1')).body?.items).toHaveLength(1);
    expect((await h.o.lastWorn(cookie, '?limit=11')).status).toBe(400);
    const th = (await h.o.wearHistory(cookie, top.id)).body?.items as Json[];
    expect(th.map((r) => r.localDate)).toEqual(['2026-11-04', '2026-11-03', '2026-11-02']);
    expect((await h.o.wearHistory(cookie, bottom.id)).body?.items).toHaveLength(2);
    // an invalidated record leaves the history, the older ones come back in
    await h.o.invalidate(cookie, recs[3] as string, { reason: 'mistake' }, 'W/"v1"');
    expect(((await h.o.wearHistory(cookie, top.id)).body?.items as Json[]).map((r) => r.localDate)).toEqual(['2026-11-03', '2026-11-02', '2026-11-01']);
  });

  it('snapshots_survive_garment_edit_trash_and_purge_without_any_photo_reference', async () => {
    const { h, cookie, planned, top, items } = await setup();
    const o = await planned();
    const rec = ((await h.o.confirm(cookie, o.id, { expectedVersion: 1 })).body?.wearRecord as Json).id as string;
    const before = (await h.o.wear(cookie, rec)).body as Json;
    const g = await h.api.getGarment(cookie, top.id);
    await h.api.patchGarment(cookie, top.id, { nickname: 'Renamed', primaryColor: { code: 'RED' } }, etag(g));
    expect((await h.o.wear(cookie, rec)).body).toEqual(before); // edit: snapshot unchanged
    await h.api.deleteGarment(cookie, top.id);
    expect(((await h.o.lastWorn(cookie)).body?.items as Json[])[0]).toEqual(before); // trash
    expect(((await h.o.wearHistory(cookie, top.id)).status)).toBe(200);
    await db.garment.delete({ where: { id: top.id } }); // what the purge job does
    const after = (await h.o.lastWorn(cookie)).body?.items as Json[];
    expect(after[0]?.items).toHaveLength(4);
    expect(after[0]?.items[0]).toMatchObject({ garmentId: null, role: 'TOP', snapshot: { nickname: 'Top', categoryCode: 'TOPS', subtypeCode: 'SHIRT', primaryColorCode: 'BLUE' } });
    expect(JSON.stringify(after)).not.toMatch(/photo|url|key/i);
    expect(after[0]?.items.slice(1).map((i: Json) => i.garmentId)).toEqual(items.slice(1).map((i) => i.garmentId));
    // the planned outfit lost the purged garment, the worn one is history
    expect(((await h.o.get(cookie, o.id)).body?.items as Json[]).length).toBe(3);
    expect((await h.o.wearHistory(cookie, top.id)).status).toBe(404);
  });
});

describe('security: owner scope on every endpoint', () => {
  it('another_user_gets_404_for_every_resource_and_anonymous_gets_401', async () => {
    const { h, cookie, ocookie, planned, top } = await setup();
    const o = await planned();
    const rec = ((await h.o.confirm(cookie, o.id, { expectedVersion: 1 })).body?.wearRecord as Json).id as string;
    const draft = (await h.o.create(cookie, { items: [{ garmentId: top.id, role: 'TOP' }] })).body as Json;
    const tpl = (await h.o.saveAsTemplate(cookie, draft.id, { name: 'T' })).body as Json;
    const calls: [string, (c: string | undefined) => Promise<{ status: number }>][] = [
      ['get', (c) => h.o.get(c, draft.id)],
      ['patch', (c) => h.o.patch(c, draft.id, { title: 'x' }, 'W/"v1"')],
      ['cancel', (c) => h.o.cancel(c, draft.id)],
      ['addItem', (c) => h.o.addItem(c, draft.id, { garmentId: top.id, role: 'TOP' }, 'W/"v1"')],
      ['removeItem', (c) => h.o.removeItem(c, draft.id, top.id, 'W/"v1"')],
      ['replaceItem', (c) => h.o.replaceItem(c, draft.id, top.id, { garmentId: top.id }, 'W/"v1"')],
      ['conflicts', (c) => h.o.conflicts(c, draft.id)],
      ['confirm', (c) => h.o.confirm(c, draft.id, { expectedVersion: 1 })],
      ['saveAsTemplate', (c) => h.o.saveAsTemplate(c, draft.id, { name: 'x' })],
      ['wear', (c) => h.o.wear(c, rec)],
      ['wash', (c) => h.o.wash(c, rec, { garmentIds: [] })],
      ['invalidate', (c) => h.o.invalidate(c, rec, { reason: 'x' }, 'W/"v1"')],
      ['wearHistory', (c) => h.o.wearHistory(c, top.id)],
      ['tGet', (c) => h.o.tGet(c, tpl.id)],
      ['tPatch', (c) => h.o.tPatch(c, tpl.id, { name: 'x' }, 'W/"v1"')],
      ['tDelete', (c) => h.o.tDelete(c, tpl.id)],
      ['instantiate', (c) => h.o.instantiate(c, tpl.id, { status: 'DRAFT' })],
    ];
    for (const [name, run] of calls) {
      expect([name, (await run(ocookie)).status]).toEqual([name, 404]);
      expect([name, (await run(undefined)).status]).toEqual([name, 401]);
    }
    // nothing leaked or changed
    expect((await h.o.get(cookie, draft.id)).body).toMatchObject({ version: 1, status: 'DRAFT' });
    expect((await h.o.tGet(cookie, tpl.id)).status).toBe(200);
    // lists are scoped, and unauthenticated lists are 401
    expect((await h.o.list(ocookie)).body?.items).toEqual([]);
    expect((await h.o.lastWorn(ocookie)).body?.items).toEqual([]);
    expect((await h.o.tList(ocookie)).body?.items).toEqual([]);
    expect((await h.o.list(ocookie, '?from=2026-11-01&to=2026-11-30')).body?.items).toEqual([]);
    for (const run of [h.o.list, h.o.lastWorn, h.o.tList]) expect((await run(undefined)).status).toBe(401);
    expect((await h.o.create(undefined, {})).status).toBe(401);
    expect((await h.o.tCreate(undefined, { name: 'x' })).status).toBe(401);
    // a foreign user cannot plan with my garments
    expect((await h.o.create(ocookie, { items: [{ garmentId: top.id, role: 'TOP' }] })).status).toBe(404);
  });
});
