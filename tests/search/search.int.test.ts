import { afterAll, describe, expect, it } from 'vitest';
import { closeAll, db, wardrobeHarness, type Json } from '../wardrobe/harness';

afterAll(closeAll);
const harness = () => {
  const h = wardrobeHarness();
  const call = async (...args: Parameters<typeof h.send>) => { const r = await h.send(...args); return { ...r, body: r.body as Json }; };
  const search = (cookie?: string, query = '', post?: unknown) => call(h.http.search.garments, h.request(`/search/garments${query}`, { cookie, ...(post !== undefined ? { method: 'POST', body: post } : {}) }));
  const draft = (cookie: string, ids: string[]) => call(h.http.search.draft, h.request('/search/outfit-draft', { cookie, method: 'POST', body: { garmentIds: ids } }));
  return { ...h, search, draft };
};
describe('search live MariaDB + real sessions', () => {
  it('requires a session and validates strict parameters', async () => {
    const h = harness();
    expect((await h.search()).status).toBe(401);
    const { cookie } = await h.signedIn();
    expect((await h.search(cookie, '?ownerId=foreign')).status).toBe(400);
    expect((await h.search(cookie, '?limit=101')).status).toBe(400);
    expect((await h.search(cookie, '?category=UNKNOWN')).status).toBe(400);
  });
  it('matches the same catalog item in all three languages, never another owner or trash', async () => {
    const h = harness();
    const a = await h.signedIn();
    const b = await h.signedIn();
    const body = { categoryCode: 'FOOTWEAR', subtypeCode: 'SNEAKERS', primaryColor: { code: 'BLACK' }, styles: ['BUSINESS'] };
    const own = await h.api.createGarment(a.cookie, body);
    await h.api.createGarment(b.cookie, body);
    const trash = await h.api.createGarment(a.cookie, body);
    await h.api.deleteGarment(a.cookie, String(trash.body!.id));
    for (const q of ['baskets noires disponibles pour le travail', 'black sneakers available for work', 'حذاء رياضي أسود متاح للعمل']) {
      const r = await h.search(a.cookie, `?q=${encodeURIComponent(q)}`);
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('no-store');
      expect(r.body!.items.map((x: { id: string }) => x.id)).toEqual([own.body!.id]);
      expect(r.body!.mode).toBe('text');
    }
    expect((await h.search(a.cookie, '?q=black&color=RED')).body!.items).toEqual([]);
  });
  it('reads edits, status changes, tags, collections and sets immediately; supports POST and pagination', async () => {
    const h = harness();
    const { cookie } = await h.signedIn();
    const first = await h.api.createGarment(cookie, h.shirt({ notes: 'Lin biologique' }));
    const second = await h.api.createGarment(cookie, h.shirt());
    const g = String(first.body!.id);
    const t = await h.organizers.tags.create(cookie, 'Capsule');
    const c = await h.organizers.collections.create(cookie, 'Voyage');
    const s = await h.organizers.garmentSets.create(cookie, 'Week-end');
    await h.organizers.tags.attach(cookie, String(t.body!.id), [g]);
    await h.organizers.collections.attach(cookie, String(c.body!.id), [g]);
    await h.organizers.garmentSets.attach(cookie, String(s.body!.id), [g]);
    const r = await h.search(cookie, '', { q: 'lin capsule voyage week', tag: String(t.body!.id), collection: String(c.body!.id), set: String(s.body!.id) });
    expect(r.status).toBe(200);
    expect(r.body!.items.map((x: { id: string }) => x.id)).toEqual([g]);
    const page = await h.search(cookie, '?limit=1');
    expect(page.body!.nextCursor).toBeTruthy();
    const next = await h.search(cookie, `?limit=1&cursor=${page.body!.nextCursor}`);
    expect(new Set([page.body!.items[0].id, next.body!.items[0].id])).toEqual(new Set([g, second.body!.id]));
    await h.api.patchGarment(cookie, g, { notes: 'Laine' }, first.headers.get('etag')!);
    expect((await h.search(cookie, '?q=lin')).body!.items).toEqual([]);
    await h.api.deleteGarment(cookie, g);
    expect((await h.search(cookie, '?q=laine')).body!.items).toEqual([]);
    const restored = await h.api.restore(cookie, g);
    await h.api.setStatus(cookie, g, { status: 'LENT' }, restored.headers.get('etag')!);
    expect((await h.search(cookie, '?q=laine&status=AVAILABLE')).body!.items).toEqual([]);
    expect((await h.search(cookie, '?q=laine')).body!.items.map((x: { id: string }) => x.id)).toEqual([g]);
  });
  it('prepares a selection without persisting and refuses any foreign or trashed id', async () => {
    const h = harness();
    const a = await h.signedIn();
    const b = await h.signedIn();
    const g = String((await h.api.createGarment(a.cookie, h.shirt())).body!.id);
    const count = await db.outfit.count({ where: { ownerId: a.userId } });
    expect((await h.draft(a.cookie, [g])).body).toEqual({ garmentIds: [g], unavailableIds: [], saved: false });
    expect(await db.outfit.count({ where: { ownerId: a.userId } })).toBe(count);
    expect((await h.draft(b.cookie, [g])).status).toBe(404);
    await h.api.deleteGarment(a.cookie, g);
    expect((await h.draft(a.cookie, [g])).status).toBe(404);
  });
});

it('enforces CSRF and a per-user search budget on all search handlers', async () => {
  const h = harness();
  const { cookie } = await h.signedIn();
  const noCsrf = h.request('/search/garments', { cookie, method: 'POST', body: {} });
  noCsrf.headers.delete('X-Requested-With');
  expect((await h.send(h.http.search.garments, noCsrf)).status).toBe(403);
  for (let n = 0; n < 30; n++) {
    const r = await h.send(h.http.search.suggestions, h.request('/search/suggestions?q=basket', { cookie }));
    expect(r.status).toBe(200);
  }
  const limited = await h.search(cookie);
  expect(limited.status).toBe(429);
  expect(limited.headers.get('retry-after')).toBeTruthy();
});
