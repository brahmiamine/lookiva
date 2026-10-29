import { afterAll, describe, expect, it } from 'vitest';
import { createWardrobePurge } from '@/modules/wardrobe';
import { createPrismaGarmentStore } from '@/modules/wardrobe/infrastructure/prisma-store';
import { createLogger } from '@/platform/logger';
import type { OwnerId } from '@/platform/kernel';
import type { MemoryObjectStorage } from '@/platform/storage/memory';
import { shape } from '../identity/harness';
import { jpeg } from './fixtures';
import { closeAll, db, wardrobeHarness, type Json } from './harness';

afterAll(closeAll);

const DAY = 86_400_000;
const keysOf = (s: MemoryObjectStorage) => [...s.objects.keys()].sort();
const UNKNOWN = '3f8e1b2a-9c4d-4e5f-8a6b-7c8d9e0f1a2b';

async function setup(opts: Parameters<typeof wardrobeHarness>[0] = {}) {
  const h = wardrobeHarness(opts);
  const { cookie } = await h.signedIn();
  const other = (await h.signedIn()).cookie;
  const mk = async (extra: Json = {}, c = cookie) => (await h.api.createGarment(c, h.shirt(extra))).body as Json;
  const purge = createWardrobePurge({ db, storage: h.storage, log: createLogger({ level: 'error' }) });
  const photo = async (gid: string, c = cookie) => (await h.photos.upload(c, gid, { bytes: await jpeg(), type: 'image/jpeg' })).body as Json;
  return { h, cookie, other, mk, purge, photo, get: async (id: string, c = cookie) => (await h.api.getGarment(c, id)).body as Json };
}

describe('duplicate', () => {
  it('creates_a_new_available_garment_prefilled_without_history_and_independent_of_the_source', async () => {
    const { h, cookie, mk, get } = await setup();
    const src = await mk({ nickname: 'Bleue', notes: 'lin', seasons: ['SUMMER'], purchasePrice: 10, purchaseCurrency: 'EUR', warmth: 'LIGHT' });
    await h.api.setStatus(cookie, src.id, { status: 'LENT' }, 'W/"v1"');
    const res = await h.api.duplicate(cookie, src.id);
    expect(res.status).toBe(201);
    expect(res.headers.get('etag')).toBe('W/"v1"');
    expect(res.body).toMatchObject({ nickname: 'Bleue', notes: 'lin', seasons: ['SUMMER'], purchasePrice: 10, warmth: 'LIGHT', status: 'AVAILABLE', version: 1, recommendable: true });
    expect(res.body?.id as string).not.toBe(src.id);
    expect(res.body).not.toHaveProperty('favorite');
    expect(((await h.api.history(cookie, res.body?.id as string)).body?.items as Json[]).map((e) => [e.fromStatus, e.toStatus])).toEqual([[null, 'AVAILABLE']]);
    // independence both ways
    await h.api.deleteGarment(cookie, src.id);
    expect((await get(res.body?.id as string)).status).toBe('AVAILABLE');
    const copy2 = await h.api.duplicate(cookie, res.body?.id as string);
    await h.api.setStatus(cookie, res.body?.id as string, { status: 'TO_WASH' }, 'W/"v1"');
    expect((await get(copy2.body?.id as string)).status).toBe('AVAILABLE');
  });

  it('applies_overrides_and_validates_them_like_a_create', async () => {
    const { h, cookie, mk } = await setup();
    const src = await mk({ nickname: 'A', styles: ['CASUAL'] });
    const ok = await h.api.duplicate(cookie, src.id, { nickname: 'Rouge', primaryColor: { code: 'RED' }, subtypeCode: 'POLO', styles: [] });
    expect(ok.body).toMatchObject({ nickname: 'Rouge', primaryColor: { code: 'RED' }, subtypeCode: 'POLO', styles: [] });
    const custom = (await h.api.createCustom(cookie, { label: 'Marinière', parentSubtypeCode: 'TSHIRT' })).body as Json;
    const viaCustom = await h.api.duplicate(cookie, src.id, { customSubcategoryId: custom.id });
    expect(viaCustom.body).toMatchObject({ subtypeCode: null, customSubcategory: { id: custom.id } });
    const back = await h.api.duplicate(cookie, viaCustom.body?.id as string, { subtypeCode: 'SHIRT' });
    expect(back.body).toMatchObject({ subtypeCode: 'SHIRT', customSubcategory: null });
    const before = ((await h.api.listGarments(cookie)).body?.items as Json[]).length;
    expect((await h.api.duplicate(cookie, src.id, { subtypeCode: 'JEANS' })).status).toBe(400);
    expect((await h.api.duplicate(cookie, src.id, { status: 'LENT' })).status).toBe(400);
    expect((await h.api.duplicate(cookie, src.id, { copyPhotos: 'yes' })).status).toBe(400);
    expect((await h.api.duplicate(cookie, src.id, { customSubcategoryId: UNKNOWN })).status).toBe(404);
    expect(((await h.api.listGarments(cookie)).body?.items as Json[]).length).toBe(before);
  });

  it('is_idempotent_per_key_and_distinct_keys_make_distinct_garments', async () => {
    const { h, cookie, mk } = await setup();
    const src = await mk();
    const k = h.wardrobeIdem();
    const a = await h.api.duplicate(cookie, src.id, {}, k);
    const b = await h.api.duplicate(cookie, src.id, {}, k);
    expect(b.status).toBe(201);
    expect(b.body?.id as string).toBe(a.body?.id as string);
    const c = await h.api.duplicate(cookie, src.id);
    expect(c.body?.id as string).not.toBe(a.body?.id as string);
    expect(((await h.api.listGarments(cookie)).body?.items as Json[]).length).toBe(3);
    expect((await h.api.duplicate(cookie, src.id, { nickname: 'x' }, k)).body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect((await h.api.duplicate(cookie, src.id, {}, {})).body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  });

  it('parallel_duplicates_with_the_same_key_create_exactly_one_garment', async () => {
    const { h, cookie, mk } = await setup();
    const src = await mk();
    const k = h.wardrobeIdem();
    const rs = await Promise.all(Array.from({ length: 5 }, () => h.api.duplicate(cookie, src.id, {}, k)));
    const ok = rs.filter((r) => r.status === 201);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ok.map((r) => r.body?.id as string)).size).toBe(1);
    for (const r of rs.filter((r) => r.status !== 201)) expect(r.body).toMatchObject({ code: 'IDEMPOTENCY_IN_PROGRESS' });
    expect(((await h.api.listGarments(cookie)).body?.items as Json[]).length).toBe(2);
  });

  it('copies_photos_on_request_sharing_objects_that_survive_until_the_last_row_goes', async () => {
    const { h, cookie, mk, photo } = await setup();
    const src = await mk();
    const p = await photo(src.id);
    await photo(src.id);
    const store = h.storage as MemoryObjectStorage;
    const objects = keysOf(store).length;
    const without = await h.api.duplicate(cookie, src.id, { copyPhotos: false });
    expect((await h.photos.list(cookie, without.body?.id as string)).body?.items).toEqual([]);
    const withp = await h.api.duplicate(cookie, src.id, { copyPhotos: true });
    const copied = (await h.photos.list(cookie, withp.body?.id as string)).body?.items as Json[];
    expect(copied.map((c) => c.isPrimary)).toEqual([true, false]);
    expect(copied[0]?.id).not.toBe(p.id);
    expect(keysOf(store).length).toBe(objects); // shared, not re-stored
    // delete on the source never breaks the copy
    expect((await h.photos.remove(cookie, src.id, p.id)).status).toBe(204);
    expect((await h.photos.file(cookie, withp.body?.id as string, copied[0]?.id)).status).toBe(200);
    // and deleting the copy's photo afterwards frees the objects of that photo
    expect((await h.photos.remove(cookie, withp.body?.id as string, copied[0]?.id)).status).toBe(204);
    expect(keysOf(store).length).toBe(objects - 3);
  });

  it('a_trashed_or_foreign_source_is_404_and_nothing_is_created', async () => {
    const { h, cookie, other, mk } = await setup();
    const src = await mk();
    const trashed = await mk();
    await h.api.deleteGarment(cookie, trashed.id);
    const foreign = await h.api.duplicate(other, src.id);
    const unknown = await h.api.duplicate(other, UNKNOWN);
    expect(foreign.status).toBe(404);
    expect(shape(foreign.body)).toEqual(shape(unknown.body));
    expect((await h.api.duplicate(cookie, trashed.id)).status).toBe(404);
    expect((await h.api.duplicate(undefined, src.id)).status).toBe(401);
    expect(((await h.api.listGarments(other)).body?.items as Json[]).length).toBe(0);
  });
});

describe('bulk actions', () => {
  it('set_status_changes_only_the_chosen_ids_and_writes_one_event_each', async () => {
    const { h, cookie, mk, get } = await setup();
    const g = [await mk(), await mk(), await mk(), await mk(), await mk()];
    await h.api.setStatus(cookie, g[1]?.id, { status: 'TO_WASH' }, 'W/"v1"');
    const res = await h.api.bulk(cookie, { action: 'SET_STATUS', ids: [g[0]?.id, g[1]?.id, g[2]?.id], params: { status: 'TO_WASH', note: 'bulk' } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ action: 'SET_STATUS', affected: 2, unchangedIds: [g[1]?.id] });
    expect((res.body?.changedIds as string[]).sort()).toEqual([g[0]?.id, g[2]?.id].sort());
    expect(await get(g[0]?.id)).toMatchObject({ status: 'TO_WASH', version: 2, recommendable: false });
    expect(await get(g[1]?.id)).toMatchObject({ status: 'TO_WASH', version: 2 }); // unchanged: no bump
    for (const n of [g[3], g[4]]) expect(await get(n?.id)).toMatchObject({ status: 'AVAILABLE', version: 1 });
    const ev = (await h.api.history(cookie, g[0]?.id)).body?.items as Json[];
    expect(ev.map((e) => [e.fromStatus, e.toStatus, e.note])).toEqual([['AVAILABLE', 'TO_WASH', 'bulk'], [null, 'AVAILABLE', null]]);
    expect(((await h.api.history(cookie, g[1]?.id)).body?.items as Json[]).length).toBe(2);
  });

  it('set_category_validates_the_classification_for_the_whole_batch', async () => {
    const { h, cookie, mk, get } = await setup();
    const a = await mk();
    const b = await mk();
    const ok = await h.api.bulk(cookie, { action: 'SET_CATEGORY', ids: [a.id, b.id], params: { categoryCode: 'BOTTOMS', subtypeCode: 'JEANS' } });
    expect(ok.body).toMatchObject({ affected: 2 });
    expect(await get(a.id)).toMatchObject({ categoryCode: 'BOTTOMS', subtypeCode: 'JEANS', version: 2 });
    const bad = await h.api.bulk(cookie, { action: 'SET_CATEGORY', ids: [a.id], params: { categoryCode: 'TOPS', subtypeCode: 'JEANS' } });
    expect(bad.status).toBe(400);
    expect((await h.api.bulk(cookie, { action: 'SET_CATEGORY', ids: [a.id], params: { categoryCode: 'TOPS', subtypeCode: null, customSubcategoryId: UNKNOWN } })).status).toBe(404);
    expect(await get(a.id)).toMatchObject({ categoryCode: 'BOTTOMS', version: 2 });
  });

  it('delete_moves_to_the_trash_with_usage_warnings_and_spares_the_others', async () => {
    const usage = { check: async (_o: string, ids: string[]) => ids.map((garmentId) => ({ garmentId, kind: 'ACTIVE_OUTFIT', count: 2 })) };
    const { h, cookie, mk, get } = await setup({ usage });
    const [a, b, c] = [await mk(), await mk(), await mk()];
    const res = await h.api.bulk(cookie, { action: 'DELETE', ids: [a.id, b.id] });
    expect(res.status).toBe(200);
    expect(res.body?.warnings).toEqual([{ garmentId: a.id, kind: 'ACTIVE_OUTFIT', count: 2 }, { garmentId: b.id, kind: 'ACTIVE_OUTFIT', count: 2 }].sort((x, y) => (res.body?.changedIds as string[]).indexOf(x.garmentId) - (res.body?.changedIds as string[]).indexOf(y.garmentId)));
    expect((await h.api.getGarment(cookie, a.id)).status).toBe(404);
    expect(await get(c.id)).toMatchObject({ version: 1 });
    expect(((await h.api.trash(cookie)).body?.items as Json[]).map((t) => t.id).sort()).toEqual([a.id, b.id].sort());
    // single delete: 200 + warnings when there are some, 204 otherwise
    const single = await h.api.deleteGarment(cookie, c.id);
    expect(single.status).toBe(200);
    expect(single.body).toEqual({ warnings: [{ garmentId: c.id, kind: 'ACTIVE_OUTFIT', count: 2 }] });
  });

  it('is_all_or_nothing_and_foreign_ids_look_exactly_like_unknown_ones', async () => {
    const { h, cookie, other, mk, get } = await setup();
    const mine = [await mk(), await mk()];
    const theirs = await mk({}, other);
    const trashed = await mk();
    await h.api.deleteGarment(cookie, trashed.id);
    const withForeign = await h.api.bulk(cookie, { action: 'SET_STATUS', ids: [mine[0]?.id, theirs.id, mine[1]?.id], params: { status: 'LENT' } });
    const withUnknown = await h.api.bulk(cookie, { action: 'SET_STATUS', ids: [mine[0]?.id, UNKNOWN, mine[1]?.id], params: { status: 'LENT' } });
    expect(withForeign.status).toBe(404);
    expect(withForeign.body?.errors).toEqual([{ path: 'ids.1', message: `garment ${theirs.id} not found` }]);
    expect(withUnknown.body?.errors).toEqual([{ path: 'ids.1', message: `garment ${UNKNOWN} not found` }]);
    expect(shape(withForeign.body)).toEqual({ ...shape(withUnknown.body), errors: withForeign.body?.errors });
    const withTrashed = await h.api.bulk(cookie, { action: 'DELETE', ids: [mine[0]?.id, trashed.id] });
    expect(withTrashed.status).toBe(404);
    for (const m of mine) expect(await get(m.id)).toMatchObject({ status: 'AVAILABLE', version: 1 });
    expect(await get(theirs.id, other)).toMatchObject({ status: 'AVAILABLE', version: 1 });
    expect(((await h.api.history(cookie, mine[0]?.id)).body?.items as Json[]).length).toBe(1);
    // a stranger cannot touch mine either
    const attack = await h.api.bulk(other, { action: 'DELETE', ids: [mine[0]?.id] });
    expect(attack.status).toBe(404);
    expect((await h.api.getGarment(cookie, mine[0]?.id)).status).toBe(200);
  });

  it('expectedVersions_turn_a_stale_id_into_a_409_with_one_error_per_id_and_change_nothing', async () => {
    const { h, cookie, mk, get } = await setup();
    const [a, b, c] = [await mk(), await mk(), await mk()];
    await h.api.setStatus(cookie, a.id, { status: 'DRYING' }, 'W/"v1"');
    await h.api.setStatus(cookie, b.id, { status: 'DRYING' }, 'W/"v1"');
    const stale = await h.api.bulk(cookie, { action: 'SET_STATUS', ids: [a.id, b.id, c.id], params: { status: 'LENT' }, expectedVersions: { [a.id]: 1, [b.id]: 2, [c.id]: 1 } });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'VERSION_CONFLICT', errors: [{ path: `expectedVersions.${a.id}`, message: 'current version is 2' }] });
    expect(await get(c.id)).toMatchObject({ status: 'AVAILABLE', version: 1 });
    const ok = await h.api.bulk(cookie, { action: 'SET_STATUS', ids: [a.id, b.id, c.id], params: { status: 'LENT' }, expectedVersions: { [a.id]: 2, [b.id]: 2, [c.id]: 1 } });
    expect(ok.status).toBe(200);
    expect((await h.api.bulk(cookie, { action: 'SET_STATUS', ids: [a.id], params: { status: 'LENT' }, expectedVersions: { [b.id]: 1 } })).status).toBe(400);
  });

  it('rejects_malformed_requests', async () => {
    const { h, cookie, mk } = await setup();
    const g = await mk();
    const p = { status: 'LENT' };
    expect((await h.api.bulk(cookie, { action: 'SET_STATUS', ids: [], params: p })).status).toBe(400);
    expect((await h.api.bulk(cookie, { action: 'SET_STATUS', ids: [g.id, g.id], params: p })).status).toBe(400);
    expect((await h.api.bulk(cookie, { action: 'SET_STATUS', ids: Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`), params: p })).status).toBe(400);
    expect((await h.api.bulk(cookie, { action: 'SET_STATUS', ids: ['x'], params: p })).status).toBe(400);
    expect((await h.api.bulk(cookie, { action: 'EXPLODE', ids: [g.id] })).status).toBe(400);
    expect((await h.api.bulk(cookie, { action: 'SET_STATUS', ids: [g.id], params: { status: 'NOPE' } })).status).toBe(400);
    expect((await h.api.bulk(cookie, { action: 'DELETE', ids: [g.id], params: {} })).status).toBe(400);
    expect((await h.api.bulk(undefined, { action: 'DELETE', ids: [g.id] })).status).toBe(401);
    expect((await h.api.bulk(cookie, { action: 'DELETE', ids: [g.id] }, {})).body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    // 100 ids are accepted (all unknown here -> a clean 404, never a 400/500)
    expect((await h.api.bulk(cookie, { action: 'DELETE', ids: Array.from({ length: 100 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) })).status).toBe(404);
  });

  it('is_idempotent_on_the_key', async () => {
    const { h, cookie, mk, get } = await setup();
    const g = await mk();
    const k = h.wardrobeIdem();
    const body = { action: 'SET_STATUS', ids: [g.id], params: { status: 'LENT' } };
    const a = await h.api.bulk(cookie, body, k);
    const b = await h.api.bulk(cookie, body, k);
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect(await get(g.id)).toMatchObject({ version: 2 });
    expect(((await h.api.history(cookie, g.id)).body?.items as Json[]).length).toBe(2);
  });

  it('bulk_with_versions_racing_a_single_status_change_has_exactly_one_winner', async () => {
    const { h, cookie, mk, get } = await setup();
    for (let round = 0; round < 6; round++) {
      const [a, b] = [await mk(), await mk()];
      const [bulk, single] = await Promise.all([
        h.api.bulk(cookie, { action: 'SET_STATUS', ids: [a.id, b.id], params: { status: 'DRYING' }, expectedVersions: { [a.id]: 1, [b.id]: 1 } }),
        h.api.setStatus(cookie, a.id, { status: 'LENT' }, 'W/"v1"'),
      ]);
      expect([bulk.status, single.status].sort()).toEqual([200, 409]);
      const ga = await get(a.id);
      const gb = await get(b.id);
      expect(ga.version).toBe(2);
      if (bulk.status === 200) {
        expect(single.body).toMatchObject({ code: 'VERSION_CONFLICT' });
        expect([ga.status, gb.status]).toEqual(['DRYING', 'DRYING']);
      } else {
        expect(bulk.body).toMatchObject({ code: 'VERSION_CONFLICT' });
        expect([ga.status, gb.status, gb.version]).toEqual(['LENT', 'AVAILABLE', 1]); // atomic: b untouched
      }
      expect(((await h.api.history(cookie, a.id)).body?.items as Json[]).length).toBe(2);
    }
  });

  it('bulk_without_versions_racing_a_single_change_stays_consistent', async () => {
    const { h, cookie, mk, get } = await setup();
    const [a, b] = [await mk(), await mk()];
    const [bulk, single] = await Promise.all([
      h.api.bulk(cookie, { action: 'SET_STATUS', ids: [a.id, b.id], params: { status: 'DRYING' } }),
      h.api.setStatus(cookie, a.id, { status: 'LENT' }, 'W/"v1"'),
    ]);
    expect(bulk.status).toBe(200);
    expect([200, 409]).toContain(single.status);
    const ga = await get(a.id);
    const events = (await h.api.history(cookie, a.id)).body?.items as Json[];
    expect(events.length).toBe(ga.version); // one event per version bump, none lost or doubled
    expect(events[0]?.toStatus).toBe(ga.status);
  });
});

describe('trash, restore and purge', () => {
  it('lists_only_own_trash_with_purgeAfter_and_hides_trashed_garments_everywhere_else', async () => {
    const { h, cookie, other, mk } = await setup();
    h.clock.set(new Date('2019-03-01T10:00:00.000Z'));
    const [a, b, c] = [await mk(), await mk(), await mk({}, other)];
    await h.api.deleteGarment(cookie, a.id);
    await h.api.deleteGarment(cookie, b.id);
    await h.api.deleteGarment(other, c.id);
    const t = await h.api.trash(cookie);
    expect((t.body?.items as Json[]).map((x) => x.id)).toEqual([b.id, a.id].sort().reverse());
    expect((t.body?.items as Json[])[0]).toMatchObject({ deletedAt: '2019-03-01T10:00:00.000Z', purgeAfter: '2019-03-31T10:00:00.000Z', status: 'AVAILABLE' });
    expect((await h.api.trash(other)).body?.items).toHaveLength(1);
    const p1 = await h.api.trash(cookie, '?limit=1');
    expect(p1.body?.items).toHaveLength(1);
    const p2 = await h.api.trash(cookie, `?limit=1&cursor=${p1.body?.nextCursor}`);
    expect((p2.body?.items as Json[])[0]?.id).not.toBe((p1.body?.items as Json[])[0]?.id);
    expect(p2.body?.nextCursor).toBeUndefined();
    expect((await h.api.listGarments(cookie)).body?.items).toEqual([]);
    expect((await h.api.listGarments(cookie, '?status=AVAILABLE&q=')).status).toBe(400);
    expect((await h.api.listGarments(cookie, '?status=AVAILABLE')).body?.items).toEqual([]);
    expect((await h.api.getGarment(cookie, a.id)).status).toBe(404);
    expect((await h.api.trash(undefined)).status).toBe(401);
  });

  it('restore_brings_the_garment_back_as_it_was_and_is_owner_only', async () => {
    const { h, cookie, other, mk, get } = await setup();
    h.clock.set(new Date('2019-04-01T10:00:00.000Z'));
    const g = await mk({ nickname: 'Back' });
    await h.api.setStatus(cookie, g.id, { status: 'IN_REPAIR' }, 'W/"v1"');
    await h.api.deleteGarment(cookie, g.id);
    const foreign = await h.api.restore(other, g.id);
    const unknown = await h.api.restore(other, UNKNOWN);
    expect(foreign.status).toBe(404);
    expect(shape(foreign.body)).toEqual(shape(unknown.body));
    expect((await h.api.trash(cookie)).body?.items).toHaveLength(1);
    expect((await h.api.restore(undefined, g.id)).status).toBe(401);
    const r = await h.api.restore(cookie, g.id);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: g.id, nickname: 'Back', status: 'IN_REPAIR', recommendable: false, version: 4 });
    expect(r.headers.get('etag')).toBe('W/"v4"');
    expect(await get(g.id)).toMatchObject({ status: 'IN_REPAIR' });
    expect((await h.api.trash(cookie)).body?.items).toEqual([]);
    expect((await h.api.restore(cookie, g.id)).status).toBe(404); // no longer trashed
    expect((await h.api.restore(cookie, 'nope')).status).toBe(404);
  });

  it('honours_the_30_day_boundary_with_an_injected_clock_and_restore_after_purge_is_404', async () => {
    const { h, cookie, mk, purge } = await setup();
    const T = new Date('2019-06-01T00:00:00.000Z');
    h.clock.set(T);
    await purge(T); // the purge is global: clear what earlier tests left behind
    const [early, late] = [await mk(), await mk()];
    await h.api.deleteGarment(cookie, early.id);
    await h.api.deleteGarment(cookie, late.id);
    const boundary = T.getTime() + 30 * DAY;
    expect((await purge(new Date(boundary - 1))).purged).toBe(0);
    h.clock.set(new Date(boundary - 1));
    expect((await h.api.restore(cookie, early.id)).status).toBe(200); // one ms before: still restorable
    h.clock.set(new Date(boundary));
    const expired = await h.api.restore(cookie, late.id);
    expect(expired.status).toBe(410);
    expect(expired.body).toMatchObject({ code: 'TRASH_EXPIRED' });
    expect((await h.api.trash(cookie)).body?.items).toHaveLength(1); // still listed until purged
    expect((await purge(new Date(boundary))).purged).toBeGreaterThanOrEqual(1);
    expect((await h.api.restore(cookie, late.id)).status).toBe(404);
    expect((await h.api.trash(cookie)).body?.items).toEqual([]);
    expect(await db.garment.count({ where: { id: late.id } })).toBe(0);
    expect(await db.garmentStatusEvent.count({ where: { garmentId: late.id } })).toBe(0);
    expect(await db.garment.count({ where: { id: early.id } })).toBe(1); // restored one is safe
    expect((await purge(new Date(boundary))).purged).toBe(0); // idempotent
  });

  it('restore_racing_the_purge_has_one_winner', async () => {
    const { h, cookie, mk, purge } = await setup();
    const T = new Date('2018-02-01T00:00:00.000Z');
    h.clock.set(T);
    const g = await mk();
    await h.api.deleteGarment(cookie, g.id);
    h.clock.set(new Date(T.getTime() + 30 * DAY - 1000));
    const [r] = await Promise.all([h.api.restore(cookie, g.id), purge(new Date(T.getTime() + 30 * DAY - 1000))]);
    // purge (now = clock) saw purgeAfter in the future: nothing to purge, restore wins
    expect(r.status).toBe(200);
    h.clock.set(new Date(T.getTime() + 31 * DAY));
    await h.api.deleteGarment(cookie, g.id);
    h.clock.set(new Date(T.getTime() + 62 * DAY));
    const results = await Promise.all([h.api.restore(cookie, g.id), purge(new Date(T.getTime() + 62 * DAY))]);
    // clock moved past purgeAfter for the restore too: it is either 410 (not purged yet) or 404 (purged)
    expect([404, 410]).toContain(results[0].status);
    expect(await db.garment.count({ where: { id: g.id } })).toBe(0);
  });

  it('restore_refuses_a_garment_whose_custom_subcategory_vanished', async () => {
    const { h, cookie, mk } = await setup();
    h.clock.set(new Date('2019-08-01T00:00:00.000Z'));
    const custom = (await h.api.createCustom(cookie, { label: 'Perdue', parentSubtypeCode: 'TSHIRT' })).body as Json;
    const g = await mk({ subtypeCode: undefined, customSubcategoryId: custom.id });
    expect(g.customSubcategory?.id).toBe(custom.id);
    await h.api.deleteGarment(cookie, g.id);
    // The foreign key normally forbids this; force it to prove the guard.
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.$executeRawUnsafe('DELETE FROM custom_subcategories WHERE id = ?', custom.id);
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    const r = await h.api.restore(cookie, g.id);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'CUSTOM_SUBCATEGORY_MISSING' });
    expect((await h.api.trash(cookie)).body?.items).toHaveLength(1);
  });

  it('purge_deletes_photo_objects_only_when_no_other_row_references_them', async () => {
    const { h, cookie, mk, purge, photo } = await setup();
    const store = h.storage as MemoryObjectStorage;
    h.clock.set(new Date('2019-09-01T00:00:00.000Z'));
    await purge(h.clock.now());
    const shared = await mk();
    await photo(shared.id);
    const copy = (await h.api.duplicate(cookie, shared.id, { copyPhotos: true })).body as Json;
    const lonely = await mk();
    await photo(lonely.id);
    expect(keysOf(store).length).toBe(6);
    await h.api.deleteGarment(cookie, shared.id);
    await h.api.deleteGarment(cookie, lonely.id);
    // trashed garments keep their objects until the purge
    expect(keysOf(store).length).toBe(6);
    const after = new Date('2019-10-01T00:00:00.000Z');
    expect((await purge(after)).purged).toBe(2);
    expect(keysOf(store).length).toBe(3); // lonely's objects gone, the shared ones live on through the copy
    h.clock.set(after);
    const copyPhotos = (await h.photos.list(cookie, copy.id)).body?.items as Json[];
    expect((await h.photos.file(cookie, copy.id, copyPhotos[0]?.id)).status).toBe(200);
    // purging the copy later frees the rest
    await h.api.deleteGarment(cookie, copy.id);
    h.clock.set(new Date('2019-12-01T00:00:00.000Z'));
    expect((await purge(h.clock.now())).purged).toBe(1);
    expect(keysOf(store)).toEqual([]);
  });

  it('a_failing_storage_delete_never_undoes_the_purge', async () => {
    const { h, cookie, mk, photo } = await setup();
    h.clock.set(new Date('2019-02-01T00:00:00.000Z'));
    const g = await mk();
    await photo(g.id);
    await h.api.deleteGarment(cookie, g.id);
    const broken = { ...h.storage, delete: async () => { throw new Error('disk gone'); }, put: h.storage.put.bind(h.storage), get: h.storage.get.bind(h.storage), exists: h.storage.exists.bind(h.storage) };
    const purge = createWardrobePurge({ db, storage: broken, log: createLogger({ level: 'silent' }) });
    expect((await purge(new Date('2019-04-01T00:00:00.000Z'))).purged).toBeGreaterThanOrEqual(1);
    expect(await db.garment.count({ where: { id: g.id } })).toBe(0);
  });

  it('trashed_garments_are_never_recommendable', async () => {
    const { h, cookie, mk } = await setup();
    const store = createPrismaGarmentStore(db);
    const [a, b, c] = [await mk(), await mk(), await mk()];
    const ownerId = (await db.garment.findUniqueOrThrow({ where: { id: a.id } })).ownerId as OwnerId;
    await h.api.setStatus(cookie, b.id, { status: 'TO_WASH' }, 'W/"v1"');
    await h.api.deleteGarment(cookie, c.id);
    expect(await store.recommendableIds(ownerId)).toEqual([a.id]);
    await h.api.restore(cookie, c.id);
    expect((await store.recommendableIds(ownerId)).sort()).toEqual([a.id, c.id].sort());
    await h.api.bulk(cookie, { action: 'DELETE', ids: [a.id, c.id] });
    expect(await store.recommendableIds(ownerId)).toEqual([]);
  });
});

describe.each(['tags', 'collections', 'garmentSets'] as const)('%s', (kind) => {
  it('crud_with_unique_names_per_owner_and_if_match', async () => {
    const { h, cookie, other } = await setup();
    const o = h.organizers[kind];
    const created = await o.create(cookie, '  Été ');
    expect(created.status).toBe(201);
    expect(created.headers.get('etag')).toBe('W/"v1"');
    expect(created.body).toMatchObject({ name: 'Été', garments: [], version: 1 });
    expect((await o.create(cookie, 'été')).body).toMatchObject({ status: 409, code: 'NAME_ALREADY_USED' });
    expect((await o.create(other, 'été')).status).toBe(201); // names are per owner
    for (const bad of ['', '   ', 5, 'x'.repeat(61)]) expect((await o.create(cookie, bad)).status).toBe(400);
    const id = created.body?.id as string;
    expect((await o.rename(cookie, id, 'Hiver')).status).toBe(428);
    expect((await o.rename(cookie, id, 'Hiver', 'W/"v9"')).status).toBe(409);
    const renamed = await o.rename(cookie, id, 'Hiver', 'W/"v1"');
    expect(renamed.body).toMatchObject({ name: 'Hiver', version: 2 });
    const second = (await o.create(cookie, 'Autre')).body as Json;
    expect((await o.rename(cookie, second.id, 'hiver', 'W/"v1"')).body).toMatchObject({ code: 'NAME_ALREADY_USED' });
    expect(((await o.list(cookie)).body?.items as Json[]).map((x) => x.name).sort()).toEqual(['Autre', 'Hiver']);
    expect((await o.list(cookie, '?limit=1')).body?.nextCursor).toBeTruthy();
    expect((await o.get(cookie, id)).body).toMatchObject({ name: 'Hiver' });
    expect((await o.remove(cookie, id)).status).toBe(204);
    expect((await o.get(cookie, id)).status).toBe(404);
    expect((await o.remove(cookie, id)).status).toBe(404);
  });

  it('attach_and_detach_keep_order_ignore_duplicates_and_leave_garments_untouched', async () => {
    const { h, cookie, mk, get } = await setup();
    const o = h.organizers[kind];
    const g = [await mk(), await mk(), await mk()];
    const grp = (await o.create(cookie, 'Lot')).body as Json;
    const a = await o.attach(cookie, grp.id, [g[2]?.id, g[0]?.id]);
    expect(a.status).toBe(200);
    expect(a.body?.garments).toEqual([{ id: g[2]?.id, trashed: false }, { id: g[0]?.id, trashed: false }]);
    expect(a.body?.version).toBe(2);
    const b = await o.attach(cookie, grp.id, [g[0]?.id, g[1]?.id, g[1]?.id]);
    expect((b.body?.garments as Json[]).map((x) => x.id)).toEqual([g[2]?.id, g[0]?.id, g[1]?.id]);
    expect((await o.attach(cookie, grp.id, [g[0]?.id])).body?.version).toBe(b.body?.version); // nothing new: no bump
    const d = await o.detach(cookie, grp.id, g[0]?.id);
    expect((d.body?.garments as Json[]).map((x) => x.id)).toEqual([g[2]?.id, g[1]?.id]);
    expect((await o.detach(cookie, grp.id, g[0]?.id)).status).toBe(200); // no-op
    expect((await o.detach(cookie, grp.id, UNKNOWN)).status).toBe(200);
    expect((await o.attach(cookie, grp.id, [])).status).toBe(400);
    expect((await o.attach(cookie, grp.id, ['x'])).status).toBe(400);
    expect((await o.attach(cookie, grp.id, Array.from({ length: 101 }, () => g[0]?.id))).status).toBe(400);
    await o.remove(cookie, grp.id);
    expect(await get(g[0]?.id)).toMatchObject({ version: 1 }); // garments survive the list
  });

  it('trashed_garments_stay_referenced_flagged_and_vanish_on_purge', async () => {
    const { h, cookie, mk, purge } = await setup();
    const o = h.organizers[kind];
    h.clock.set(new Date('2019-05-01T00:00:00.000Z'));
    const [a, b] = [await mk(), await mk()];
    const grp = (await o.create(cookie, 'Mix')).body as Json;
    await o.attach(cookie, grp.id, [a.id, b.id]);
    await h.api.deleteGarment(cookie, a.id);
    expect((await o.get(cookie, grp.id)).body?.garments).toEqual([{ id: a.id, trashed: true }, { id: b.id, trashed: false }]);
    expect((await o.attach(cookie, grp.id, [a.id])).status).toBe(404); // a trashed garment cannot be (re)attached
    await h.api.restore(cookie, a.id);
    expect((await o.get(cookie, grp.id)).body?.garments).toEqual([{ id: a.id, trashed: false }, { id: b.id, trashed: false }]);
    await h.api.deleteGarment(cookie, a.id);
    await purge(new Date('2019-07-01T00:00:00.000Z'));
    expect((await o.get(cookie, grp.id)).body?.garments).toEqual([{ id: b.id, trashed: false }]);
  });

  it('is_isolated_between_users_and_anonymous_is_401', async () => {
    const { h, cookie, other, mk } = await setup();
    const o = h.organizers[kind];
    const mine = await mk();
    const theirs = await mk({}, other);
    const grp = (await o.create(cookie, 'Privé')).body as Json;
    await o.attach(cookie, grp.id, [mine.id]);
    const strange = (await o.create(other, 'Autre')).body as Json;
    const unknown = await o.get(other, UNKNOWN);
    const foreign = await o.get(other, grp.id);
    expect(foreign.status).toBe(404);
    expect(shape(foreign.body)).toEqual(shape(unknown.body));
    expect((await o.rename(other, grp.id, 'Pwn', 'W/"v1"')).status).toBe(404);
    expect((await o.remove(other, grp.id)).status).toBe(404);
    expect((await o.attach(other, grp.id, [theirs.id])).status).toBe(404);
    expect((await o.detach(other, grp.id, mine.id)).status).toBe(404);
    // my garment id in the other's list, and their garment in mine: same answer as an unknown id
    const leak = await o.attach(other, strange.id, [mine.id]);
    const none = await o.attach(other, strange.id, [UNKNOWN]);
    expect(leak.status).toBe(404);
    expect((leak.body?.errors as Json[])[0]?.message).toBe(`garment ${mine.id} not found`);
    expect((none.body?.errors as Json[])[0]?.message).toBe(`garment ${UNKNOWN} not found`);
    expect((await o.attach(cookie, grp.id, [theirs.id])).status).toBe(404);
    expect((await o.get(cookie, grp.id)).body?.garments).toEqual([{ id: mine.id, trashed: false }]);
    expect(((await o.list(other)).body?.items as Json[]).map((x) => x.name)).toEqual(['Autre']);
    expect((await o.get(undefined, grp.id)).status).toBe(401);
    expect((await o.list(undefined)).status).toBe(401);
    expect((await o.create(undefined, 'x')).status).toBe(401);
    expect((await o.attach(undefined, grp.id, [mine.id])).status).toBe(401);
    expect((await o.detach(undefined, grp.id, mine.id)).status).toBe(401);
    expect((await o.rename(undefined, grp.id, 'x', 'W/"v1"')).status).toBe(401);
    expect((await o.remove(undefined, grp.id)).status).toBe(401);
  });
});
