import { afterAll, describe, expect, it } from 'vitest';
import { closeAll, db, wardrobeHarness, type Json } from './harness';

afterAll(closeAll);

describe('catalog', () => {
  it('serves_categories_colors_and_options_with_three_locales', async () => {
    const h = wardrobeHarness();
    const cats = await h.api.catalog('categories');
    expect(cats.status).toBe(200);
    const items = cats.body?.items as Json[];
    expect(items.length).toBeGreaterThanOrEqual(10);
    expect(items[0]).toMatchObject({ code: 'TOPS', labels: { fr: expect.any(String), en: expect.any(String), ar: expect.any(String) } });
    expect(items[0]?.subtypes[0]).toMatchObject({ code: expect.any(String), labels: { ar: expect.any(String) } });
    expect(((await h.api.catalog('colors')).body?.items as Json[]).length).toBe(16);
    const o = (await h.api.catalog('options')).body as Json;
    expect(o.statuses.map((s: Json) => s.code)).toEqual(['AVAILABLE', 'TO_WASH', 'WASHING', 'DRYING', 'IN_REPAIR', 'LENT']);
    expect(o.statuses.filter((s: Json) => s.recommendable).map((s: Json) => s.code)).toEqual(['AVAILABLE']);
    expect(o.seasons).toHaveLength(4);
    expect(o.weather.warmth).toContain('UNKNOWN');
  });
});

describe('POST /garments', () => {
  it('creates_available_with_defaults_and_an_etag', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const res = await h.api.createGarment(cookie, h.shirt({ nickname: 'Chemise bleue', seasons: ['SPRING'], styles: ['CASUAL'], extraColors: [{ code: 'WHITE', shade: 'LIGHT' }], notes: 'lin', purchasePrice: 29.9, purchaseCurrency: 'EUR', purchasedOn: '2026-03-01', purchaseStore: 'Zara' }));
    expect(res.status).toBe(201);
    expect(res.headers.get('etag')).toBe('W/"v1"');
    expect(res.body).toMatchObject({
      nickname: 'Chemise bleue', categoryCode: 'TOPS', subtypeCode: 'SHIRT', customSubcategory: null, primaryColor: { code: 'BLUE', shade: null },
      extraColors: [{ code: 'WHITE', shade: 'LIGHT' }], seasons: ['SPRING'], styles: ['CASUAL'], purchasePrice: 29.9, purchaseCurrency: 'EUR', purchasedOn: '2026-03-01', purchaseStore: 'Zara',
      status: 'AVAILABLE', recommendable: true, version: 1, warmth: 'UNKNOWN', rain: 'UNKNOWN', windproof: 'UNKNOWN', breathability: 'UNKNOWN', layering: 'UNKNOWN',
    });
    expect(res.body).not.toHaveProperty('ownerId');
    const history = await h.api.history(cookie, res.body?.id as string);
    expect((history.body?.items as Json[]).map((e) => [e.fromStatus, e.toStatus, e.source])).toEqual([[null, 'AVAILABLE', 'MANUAL']]);
  });

  it('two_identical_garments_have_independent_ids_and_statuses', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const a = await h.api.createGarment(cookie, h.shirt({ nickname: 'Same' }));
    const b = await h.api.createGarment(cookie, h.shirt({ nickname: 'Same' }));
    expect(a.body?.id).not.toBe(b.body?.id);
    const moved = await h.api.setStatus(cookie, a.body?.id as string, { status: 'TO_WASH' }, h.etag(a));
    expect(moved.status).toBe(200);
    expect((await h.api.getGarment(cookie, b.body?.id as string)).body).toMatchObject({ status: 'AVAILABLE', version: 1 });
    expect((await h.api.getGarment(cookie, a.body?.id as string)).body).toMatchObject({ status: 'TO_WASH', version: 2 });
  });

  it('is_idempotent_on_the_key', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const headers = h.wardrobeIdem();
    const a = await h.api.createGarment(cookie, h.shirt(), headers);
    const b = await h.api.createGarment(cookie, h.shirt(), headers);
    expect(b.status).toBe(201);
    expect(b.body?.id).toBe(a.body?.id);
    expect((await h.api.listGarments(cookie)).body?.items).toHaveLength(1);
    expect((await h.api.createGarment(cookie, h.shirt({ nickname: 'other' }), headers)).body).toMatchObject({ status: 422, code: 'IDEMPOTENCY_KEY_REUSED' });
    expect((await h.api.createGarment(cookie, h.shirt(), {})).body).toMatchObject({ status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' });
  });

  it.each([
    ['no category', { subtypeCode: 'SHIRT', primaryColor: { code: 'BLUE' } }],
    ['no subtype nor custom', { categoryCode: 'TOPS', primaryColor: { code: 'BLUE' } }],
    ['no primary color', { categoryCode: 'TOPS', subtypeCode: 'SHIRT' }],
    ['unknown category', { categoryCode: 'MEN', subtypeCode: 'SHIRT', primaryColor: { code: 'BLUE' } }],
    ['subtype of another category', { categoryCode: 'TOPS', subtypeCode: 'JEANS', primaryColor: { code: 'BLUE' } }],
    ['unknown color', { categoryCode: 'TOPS', subtypeCode: 'SHIRT', primaryColor: { code: 'TEAL' } }],
    ['bad season', { categoryCode: 'TOPS', subtypeCode: 'SHIRT', primaryColor: { code: 'BLUE' }, seasons: ['MONSOON'] }],
    ['bad weather value', { categoryCode: 'TOPS', subtypeCode: 'SHIRT', primaryColor: { code: 'BLUE' }, warmth: 'LAVA' }],
    ['status in body', { categoryCode: 'TOPS', subtypeCode: 'SHIRT', primaryColor: { code: 'BLUE' }, status: 'LENT' }],
    ['unknown field', { categoryCode: 'TOPS', subtypeCode: 'SHIRT', primaryColor: { code: 'BLUE' }, ownerId: 'x' }],
    ['negative price', { categoryCode: 'TOPS', subtypeCode: 'SHIRT', primaryColor: { code: 'BLUE' }, purchasePrice: -1, purchaseCurrency: 'EUR' }],
    ['price without currency', { categoryCode: 'TOPS', subtypeCode: 'SHIRT', primaryColor: { code: 'BLUE' }, purchasePrice: 5 }],
    ['impossible date', { categoryCode: 'TOPS', subtypeCode: 'SHIRT', primaryColor: { code: 'BLUE' }, purchasedOn: '2026-02-31' }],
  ])('rejects_%s_with_400', async (_n, body) => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const res = await h.api.createGarment(cookie, body);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('requires_a_session', async () => {
    const h = wardrobeHarness();
    expect((await h.api.createGarment(undefined, h.shirt())).body).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect((await h.api.listGarments(undefined)).status).toBe(401);
  });
});

describe('custom subcategories', () => {
  it('links_a_garment_only_to_a_compatible_custom_subcategory', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const c = await h.api.createCustom(cookie, { label: 'Chemise lin', parentSubtypeCode: 'SHIRT' });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ label: 'Chemise lin', parentSubtypeCode: 'SHIRT', categoryCode: 'TOPS', version: 1, garmentCount: 0 });
    const ok = await h.api.createGarment(cookie, { categoryCode: 'TOPS', customSubcategoryId: c.body?.id, primaryColor: { code: 'WHITE' } });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ subtypeCode: null, customSubcategory: { id: c.body?.id, label: 'Chemise lin', parentSubtypeCode: 'SHIRT' } });
    const bad = await h.api.createGarment(cookie, { categoryCode: 'BOTTOMS', customSubcategoryId: c.body?.id, primaryColor: { code: 'WHITE' } });
    expect(bad.body).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    const both = await h.api.createGarment(cookie, { categoryCode: 'TOPS', subtypeCode: 'SHIRT', customSubcategoryId: c.body?.id, primaryColor: { code: 'WHITE' } });
    expect(both.status).toBe(400);
    const unknown = await h.api.createGarment(cookie, { categoryCode: 'TOPS', customSubcategoryId: '0199aaaa-0000-7000-8000-000000000000', primaryColor: { code: 'WHITE' } });
    expect(unknown.status).toBe(404);
  });

  it('rejects_duplicate_labels_per_owner_case_insensitively_but_not_across_owners', async () => {
    const h = wardrobeHarness();
    const a = await h.signedIn();
    const b = await h.signedIn();
    expect((await h.api.createCustom(a.cookie, { label: 'Perfecto', parentSubtypeCode: 'JACKET' })).status).toBe(201);
    expect((await h.api.createCustom(a.cookie, { label: ' PERFECTO ', parentSubtypeCode: 'JACKET' })).body).toMatchObject({ status: 409, code: 'CUSTOM_SUBCATEGORY_EXISTS' });
    expect((await h.api.createCustom(b.cookie, { label: 'Perfecto', parentSubtypeCode: 'JACKET' })).status).toBe(201);
    expect((await h.api.createCustom(a.cookie, { label: 'x', parentSubtypeCode: 'NOPE' })).status).toBe(400);
  });

  it('patches_the_label_with_if_match', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const c = await h.api.createCustom(cookie, { label: 'Old', parentSubtypeCode: 'SHIRT' });
    expect((await h.api.patchCustom(cookie, c.body?.id as string, { label: 'New' })).body).toMatchObject({ status: 428 });
    const ok = await h.api.patchCustom(cookie, c.body?.id as string, { label: 'New' }, h.etag(c));
    expect(ok.body).toMatchObject({ label: 'New', version: 2 });
    expect((await h.api.patchCustom(cookie, c.body?.id as string, { label: 'Newer' }, h.etag(c))).body).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
  });

  it('must_reassign_before_deleting_a_used_one_and_does_it_atomically', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const c = await h.api.createCustom(cookie, { label: 'Chemise lin', parentSubtypeCode: 'SHIRT' });
    const other = await h.api.createCustom(cookie, { label: 'Chemise coton', parentSubtypeCode: 'SHIRT' });
    const g1 = await h.api.createGarment(cookie, { categoryCode: 'TOPS', customSubcategoryId: c.body?.id, primaryColor: { code: 'WHITE' } });
    const g2 = await h.api.createGarment(cookie, { categoryCode: 'TOPS', customSubcategoryId: c.body?.id, primaryColor: { code: 'BLUE' } });
    const id = c.body?.id as string;
    expect((await h.api.listCustom(cookie)).body?.items).toEqual(expect.arrayContaining([expect.objectContaining({ id, garmentCount: 2 })]));

    const refused = await h.api.deleteCustom(cookie, id);
    expect(refused.body).toMatchObject({ status: 409, code: 'CUSTOM_SUBCATEGORY_IN_USE' });
    expect(await db.customSubcategory.count({ where: { id } })).toBe(1);
    // incompatible target: standard subtype of another category / unknown target
    expect((await h.api.deleteCustom(cookie, id, '?reassignTo=JEANS')).status).toBe(400);
    expect((await h.api.deleteCustom(cookie, id, `?reassignTo=${id}`)).status).toBe(400);
    expect(await db.customSubcategory.count({ where: { id } })).toBe(1);

    const done = await h.api.deleteCustom(cookie, id, `?reassignTo=${other.body?.id as string}`);
    expect(done.status).toBe(204);
    expect(await db.customSubcategory.count({ where: { id } })).toBe(0);
    for (const g of [g1, g2]) expect((await h.api.getGarment(cookie, g.body?.id as string)).body).toMatchObject({ customSubcategory: { id: other.body?.id }, version: 2 });

    // to a standard subtype of the same category, then an unused one deletes freely
    expect((await h.api.deleteCustom(cookie, other.body?.id as string, '?reassignTo=POLO')).status).toBe(204);
    expect((await h.api.getGarment(cookie, g1.body?.id as string)).body).toMatchObject({ subtypeCode: 'POLO', customSubcategory: null });
    const unused = await h.api.createCustom(cookie, { label: 'Vide', parentSubtypeCode: 'SHIRT' });
    expect((await h.api.deleteCustom(cookie, unused.body?.id as string)).status).toBe(204);
  });

  it('counts_trashed_garments_as_use', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const c = await h.api.createCustom(cookie, { label: 'Lin', parentSubtypeCode: 'SHIRT' });
    const g = await h.api.createGarment(cookie, { categoryCode: 'TOPS', customSubcategoryId: c.body?.id, primaryColor: { code: 'WHITE' } });
    expect((await h.api.deleteGarment(cookie, g.body?.id as string)).status).toBe(204);
    expect((await h.api.deleteCustom(cookie, c.body?.id as string)).body).toMatchObject({ status: 409, code: 'CUSTOM_SUBCATEGORY_IN_USE' });
  });
});

describe('GET /garments', () => {
  it('paginates_newest_first_without_overlap', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await h.api.createGarment(cookie, h.shirt({ nickname: `g${i}` }))).body?.id as string);
    const p1 = await h.api.listGarments(cookie, '?limit=2');
    const p2 = await h.api.listGarments(cookie, `?limit=2&cursor=${p1.body?.nextCursor as string}`);
    const p3 = await h.api.listGarments(cookie, `?limit=2&cursor=${p2.body?.nextCursor as string}`);
    const got = [...(p1.body?.items as Json[]), ...(p2.body?.items as Json[]), ...(p3.body?.items as Json[])].map((g) => g.id);
    expect(got).toEqual([...ids].reverse());
    expect(p3.body).not.toHaveProperty('nextCursor');
    expect((await h.api.listGarments(cookie, '?limit=0')).status).toBe(400);
  });

  it('filters_by_category_subtype_color_season_style_status_and_q', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const mk = async (b: Json) => (await h.api.createGarment(cookie, b)).body as Json;
    const shirt = await mk(h.shirt({ nickname: 'Chemise Été', seasons: ['SUMMER'], styles: ['CASUAL'], notes: 'Lin léger' }));
    const jeans = await mk({ categoryCode: 'BOTTOMS', subtypeCode: 'JEANS', primaryColor: { code: 'NAVY' }, extraColors: [{ code: 'BLUE' }], seasons: ['AUTUMN', 'WINTER'], styles: ['STREETWEAR'] });
    const custom = (await h.api.createCustom(cookie, { label: 'Perfecto', parentSubtypeCode: 'JACKET' })).body as Json;
    const jacket = await mk({ categoryCode: 'OUTERWEAR', customSubcategoryId: custom.id, primaryColor: { code: 'BLACK' }, nickname: 'Veste cuir' });
    await h.api.setStatus(cookie, jacket.id, { status: 'IN_REPAIR' }, 'W/"v1"');
    const ids = async (q: string) => ((await h.api.listGarments(cookie, q)).body?.items as Json[]).map((g) => g.id).sort();
    const sorted = (...g: Json[]) => g.map((x) => x.id).sort();
    expect(await ids('')).toEqual(sorted(shirt, jeans, jacket));
    expect(await ids('?category=BOTTOMS')).toEqual(sorted(jeans));
    expect(await ids('?subtype=SHIRT')).toEqual(sorted(shirt));
    expect(await ids('?subtype=JACKET')).toEqual(sorted(jacket)); // custom subcategory matches its standard parent
    expect(await ids('?color=BLUE')).toEqual(sorted(shirt, jeans)); // primary or extra
    expect(await ids('?color=NAVY')).toEqual(sorted(jeans));
    expect(await ids('?season=WINTER')).toEqual(sorted(jeans));
    expect(await ids('?style=CASUAL')).toEqual(sorted(shirt));
    expect(await ids('?status=IN_REPAIR')).toEqual(sorted(jacket));
    expect(await ids('?status=AVAILABLE&category=TOPS')).toEqual(sorted(shirt));
    expect(await ids('?q=ete')).toEqual(sorted(shirt)); // nickname, accent and case insensitive
    expect(await ids('?q=lin%20leger')).toEqual(sorted(shirt)); // notes
    expect(await ids('?q=cuir')).toEqual(sorted(jacket));
    expect(await ids('?q=%25')).toEqual([]); // LIKE wildcard is literal
    expect((await h.api.listGarments(cookie, '?status=BROKEN')).status).toBe(400);
    expect((await h.api.listGarments(cookie, '?category=NOPE')).status).toBe(400);
  });

  it('hides_trashed_garments', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const g = await h.api.createGarment(cookie, h.shirt());
    await h.api.deleteGarment(cookie, g.body?.id as string);
    expect((await h.api.listGarments(cookie)).body?.items).toEqual([]);
  });
});

describe('GET/PATCH/DELETE /garments/{id}', () => {
  it('gets_with_etag_and_404s_unknown_or_malformed_ids', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const g = await h.api.createGarment(cookie, h.shirt());
    const got = await h.api.getGarment(cookie, g.body?.id as string);
    expect(got.headers.get('etag')).toBe('W/"v1"');
    expect((await h.api.getGarment(cookie, '0199aaaa-0000-7000-8000-000000000000')).status).toBe(404);
    expect((await h.api.getGarment(cookie, 'nope')).status).toBe(404);
  });

  it('patches_with_if_match_replaces_lists_and_keeps_classification_valid', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const g = await h.api.createGarment(cookie, h.shirt({ seasons: ['SPRING', 'SUMMER'], extraColors: [{ code: 'WHITE' }], notes: 'a' }));
    const id = g.body?.id as string;
    expect((await h.api.patchGarment(cookie, id, { notes: 'b' })).body).toMatchObject({ status: 428, code: 'IF_MATCH_REQUIRED' });
    const ok = await h.api.patchGarment(cookie, id, { seasons: ['WINTER'], extraColors: [], notes: null, warmth: 'WARM', primaryColor: { code: 'RED', shade: 'DARK' }, nickname: 'Rouge' }, h.etag(g));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('etag')).toBe('W/"v2"');
    expect(ok.body).toMatchObject({ seasons: ['WINTER'], extraColors: [], notes: null, warmth: 'WARM', primaryColor: { code: 'RED', shade: 'DARK' }, nickname: 'Rouge', subtypeCode: 'SHIRT', version: 2 });
    // stale etag
    expect((await h.api.patchGarment(cookie, id, { notes: 'c' }, h.etag(g))).body).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
    // moving to another category requires a matching subtype in the same request
    expect((await h.api.patchGarment(cookie, id, { categoryCode: 'BOTTOMS' }, 'W/"v2"')).status).toBe(400);
    expect((await h.api.patchGarment(cookie, id, { categoryCode: 'BOTTOMS', subtypeCode: 'JEANS' }, 'W/"v2"')).body).toMatchObject({ categoryCode: 'BOTTOMS', subtypeCode: 'JEANS', version: 3 });
    // status is not patchable, mandatory fields cannot be nulled
    expect((await h.api.patchGarment(cookie, id, { status: 'LENT' }, 'W/"v3"')).status).toBe(400);
    expect((await h.api.patchGarment(cookie, id, { primaryColor: null }, 'W/"v3"')).status).toBe(400);
  });

  it('switches_between_standard_and_custom_subtype', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const c = (await h.api.createCustom(cookie, { label: 'Lin', parentSubtypeCode: 'SHIRT' })).body as Json;
    const g = await h.api.createGarment(cookie, h.shirt());
    const toCustom = await h.api.patchGarment(cookie, g.body?.id as string, { subtypeCode: null, customSubcategoryId: c.id }, h.etag(g));
    expect(toCustom.body).toMatchObject({ subtypeCode: null, customSubcategory: { id: c.id } });
    const back = await h.api.patchGarment(cookie, g.body?.id as string, { subtypeCode: 'POLO', customSubcategoryId: null }, 'W/"v2"');
    expect(back.body).toMatchObject({ subtypeCode: 'POLO', customSubcategory: null });
  });

  it('soft_deletes_into_the_trash_for_30_days', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const g = await h.api.createGarment(cookie, h.shirt());
    const id = g.body?.id as string;
    expect((await h.api.deleteGarment(cookie, id)).status).toBe(204);
    const row = await db.garment.findUniqueOrThrow({ where: { id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.purgeAfter?.getTime()).toBe((row.deletedAt as Date).getTime() + 30 * 86_400_000);
    for (const r of [await h.api.getGarment(cookie, id), await h.api.patchGarment(cookie, id, { notes: 'x' }, 'W/"v2"'), await h.api.setStatus(cookie, id, { status: 'LENT' }, 'W/"v2"'), await h.api.history(cookie, id), await h.api.deleteGarment(cookie, id)]) {
      expect(r.status).toBe(404);
    }
  });
});

describe('status', () => {
  it('changes_any_to_any_with_history_in_order_and_refuses_no_change', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const g = await h.api.createGarment(cookie, h.shirt());
    const id = g.body?.id as string;
    let etag = h.etag(g);
    const path = ['TO_WASH', 'WASHING', 'DRYING', 'IN_REPAIR', 'LENT', 'AVAILABLE'];
    for (const [i, to] of path.entries()) {
      const r = await h.api.setStatus(cookie, id, { status: to, ...(i === 0 ? { note: 'tache' } : {}) }, etag);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: to, recommendable: to === 'AVAILABLE', version: i + 2 });
      etag = h.etag(r);
    }
    expect((await h.api.setStatus(cookie, id, { status: 'AVAILABLE' }, etag)).body).toMatchObject({ status: 409, code: 'STATUS_UNCHANGED' });
    expect((await h.api.setStatus(cookie, id, { status: 'BROKEN' }, etag)).status).toBe(400);
    expect((await h.api.setStatus(cookie, id, { status: 'LENT' })).status).toBe(428);
    const hist = (await h.api.history(cookie, id)).body?.items as Json[];
    expect(hist.map((e) => [e.fromStatus, e.toStatus])).toEqual([['LENT', 'AVAILABLE'], ['IN_REPAIR', 'LENT'], ['DRYING', 'IN_REPAIR'], ['WASHING', 'DRYING'], ['TO_WASH', 'WASHING'], ['AVAILABLE', 'TO_WASH'], [null, 'AVAILABLE']]);
    expect(hist[1 + 4]).toMatchObject({ note: 'tache', source: 'MANUAL', at: expect.any(String) });
    // paginated
    const p1 = await h.api.history(cookie, id, '?limit=3');
    const p2 = await h.api.history(cookie, id, `?limit=3&cursor=${p1.body?.nextCursor as string}`);
    expect([...(p1.body?.items as Json[]), ...(p2.body?.items as Json[])].map((e) => e.id)).toEqual(hist.slice(0, 6).map((e) => e.id));
    // exactly one current status in the row
    expect((await db.garment.findUniqueOrThrow({ where: { id } })).status).toBe('AVAILABLE');
  });

  it('parallel_changes_with_the_same_etag_one_wins_one_409', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const g = await h.api.createGarment(cookie, h.shirt());
    const id = g.body?.id as string;
    const results = await Promise.all(['TO_WASH', 'LENT', 'IN_REPAIR', 'DRYING'].map((to) => h.api.setStatus(cookie, id, { status: to }, h.etag(g))));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409]);
    expect(results.filter((r) => r.status === 409).every((r) => r.body?.code === 'VERSION_CONFLICT')).toBe(true);
    const winner = results.find((r) => r.status === 200)?.body as Json;
    expect((await h.api.getGarment(cookie, id)).body).toMatchObject({ status: winner.status, version: 2 });
    expect(await db.garmentStatusEvent.count({ where: { garmentId: id } })).toBe(2); // creation + the one winner
  });

  it('a_failed_change_leaves_no_history', async () => {
    const h = wardrobeHarness();
    const { cookie } = await h.signedIn();
    const g = await h.api.createGarment(cookie, h.shirt());
    await h.api.setStatus(cookie, g.body?.id as string, { status: 'LENT' }, 'W/"v9"');
    expect(await db.garmentStatusEvent.count({ where: { garmentId: g.body?.id as string } })).toBe(1);
  });
});

describe('isolation between owners', () => {
  it('user_b_gets_404_for_user_a_resources_and_never_sees_them_in_lists', async () => {
    const h = wardrobeHarness();
    const a = await h.signedIn();
    const b = await h.signedIn();
    const g = (await h.api.createGarment(a.cookie, h.shirt({ nickname: 'secret' }))).body as Json;
    const c = (await h.api.createCustom(a.cookie, { label: 'Mine', parentSubtypeCode: 'SHIRT' })).body as Json;
    for (const r of [
      await h.api.getGarment(b.cookie, g.id),
      await h.api.patchGarment(b.cookie, g.id, { notes: 'hack' }, 'W/"v1"'),
      await h.api.setStatus(b.cookie, g.id, { status: 'LENT' }, 'W/"v1"'),
      await h.api.history(b.cookie, g.id),
      await h.api.deleteGarment(b.cookie, g.id),
      await h.api.patchCustom(b.cookie, c.id, { label: 'x' }, 'W/"v1"'),
      await h.api.deleteCustom(b.cookie, c.id),
    ]) {
      expect(r.status).toBe(404);
    }
    expect((await h.api.listGarments(b.cookie, '?q=secret')).body?.items).toEqual([]);
    expect((await h.api.listCustom(b.cookie)).body?.items).toEqual([]);
    // B cannot link its garment to A's custom subcategory, nor reassign to it
    const own = (await h.api.createCustom(b.cookie, { label: 'Own', parentSubtypeCode: 'SHIRT' })).body as Json;
    expect((await h.api.createGarment(b.cookie, { categoryCode: 'TOPS', customSubcategoryId: c.id, primaryColor: { code: 'RED' } })).status).toBe(404);
    const bg = await h.api.createGarment(b.cookie, { categoryCode: 'TOPS', customSubcategoryId: own.id, primaryColor: { code: 'RED' } });
    expect((await h.api.deleteCustom(b.cookie, own.id, `?reassignTo=${c.id}`)).status).toBe(400);
    expect((await h.api.getGarment(b.cookie, bg.body?.id as string)).body).toMatchObject({ customSubcategory: { id: own.id } });
    // A's data is untouched
    expect((await h.api.getGarment(a.cookie, g.id)).body).toMatchObject({ notes: null, status: 'AVAILABLE', version: 1 });
    expect((await h.api.getGarment(a.cookie, g.id)).body?.deletedAt).toBeUndefined();
    expect(await db.garment.findUniqueOrThrow({ where: { id: g.id } })).toMatchObject({ deletedAt: null });
  });
});
