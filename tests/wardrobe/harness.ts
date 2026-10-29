import { randomUUID } from 'node:crypto';
import { FakeClock } from '@/platform';
import { createWardrobeHttp } from '@/modules/wardrobe';
import { closeAll, db, harness, redis } from '../identity/harness';

export { closeAll, db };
export type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Identity harness (real sessions) + the wardrobe API on the same db/redis. */
export function wardrobeHarness() {
  const h = harness();
  const clock = new FakeClock(new Date());
  const http = createWardrobeHttp({ db, redis, clock, withSession: h.http.withSession, rateLimitPrefix: `rl-w-${randomUUID()}` });
  const idem = () => ({ 'idempotency-key': `k-${randomUUID()}` });
  const call = (handler: (r: Request) => Promise<Response>, path: string, cookie: string | undefined, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
    h.send(handler, h.request(path, { cookie, ...init }));

  const api = {
    catalog: (kind: 'categories' | 'colors' | 'options') =>
      h.send(kind === 'categories' ? http.catalogCategories : kind === 'colors' ? http.catalogColors : http.catalogOptions, h.request(`/catalog/${kind}`)),
    createGarment: (cookie: string | undefined, body: unknown, headers: Record<string, string> = idem()) =>
      call(http.createGarment, '/garments', cookie, { method: 'POST', body, headers }),
    listGarments: (cookie: string | undefined, query = '') => call(http.listGarments, `/garments${query}`, cookie),
    getGarment: (cookie: string | undefined, id: string) => call((r) => http.getGarment(r, id), `/garments/${id}`, cookie),
    patchGarment: (cookie: string | undefined, id: string, body: unknown, ifMatch?: string) =>
      call((r) => http.updateGarment(r, id), `/garments/${id}`, cookie, { method: 'PATCH', body, headers: ifMatch === undefined ? {} : { 'if-match': ifMatch } }),
    deleteGarment: (cookie: string | undefined, id: string) => call((r) => http.deleteGarment(r, id), `/garments/${id}`, cookie, { method: 'DELETE' }),
    setStatus: (cookie: string | undefined, id: string, body: unknown, ifMatch?: string) =>
      call((r) => http.changeStatus(r, id), `/garments/${id}/status`, cookie, { method: 'POST', body, headers: ifMatch === undefined ? {} : { 'if-match': ifMatch } }),
    history: (cookie: string | undefined, id: string, query = '') => call((r) => http.statusHistory(r, id), `/garments/${id}/status-history${query}`, cookie),
    createCustom: (cookie: string | undefined, body: unknown) => call(http.createCustomSubcategory, '/custom-subcategories', cookie, { method: 'POST', body }),
    listCustom: (cookie: string | undefined, query = '') => call(http.listCustomSubcategories, `/custom-subcategories${query}`, cookie),
    patchCustom: (cookie: string | undefined, id: string, body: unknown, ifMatch?: string) =>
      call((r) => http.updateCustomSubcategory(r, id), `/custom-subcategories/${id}`, cookie, { method: 'PATCH', body, headers: ifMatch === undefined ? {} : { 'if-match': ifMatch } }),
    deleteCustom: (cookie: string | undefined, id: string, query = '') =>
      call((r) => http.deleteCustomSubcategory(r, id), `/custom-subcategories/${id}${query}`, cookie, { method: 'DELETE' }),
  };

  const shirt = (extra: Json = {}): Json => ({ categoryCode: 'TOPS', subtypeCode: 'SHIRT', primaryColor: { code: 'BLUE' }, ...extra });
  const etag = (res: { headers: Headers }) => res.headers.get('etag') as string;
  return { ...h, api, clock, shirt, etag, wardrobeIdem: idem };
}
