import { randomUUID } from 'node:crypto';
import { FakeClock } from '@/platform';
import type { BackgroundRemover } from '@/platform/background-remover/port';
import { WhiteKeyRemover } from '@/platform/background-remover/local';
import { MemoryObjectStorage } from '@/platform/storage/memory';
import type { ObjectStorage } from '@/platform/storage/objects';
import { createWardrobeHttp } from '@/modules/wardrobe';
import { closeAll, db, harness, ORIGIN, redis } from '../identity/harness';

export { closeAll, db };
export type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Identity harness (real sessions) + the wardrobe API on the same db/redis. */
export function wardrobeHarness(opts: { storage?: ObjectStorage; remover?: BackgroundRemover } = {}) {
  const h = harness();
  const storage = opts.storage ?? new MemoryObjectStorage();
  const clock = new FakeClock(new Date());
  const http = createWardrobeHttp({ db, redis, clock, withSession: h.http.withSession, rateLimitPrefix: `rl-w-${randomUUID()}`, storage, remover: opts.remover ?? new WhiteKeyRemover() });
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

  /** Same headers as h.request (cookie, CSRF, origin) around a multipart / streamed body. */
  const raw = (path: string, cookie: string | undefined, method: string, body: BodyInit | null, headers: Record<string, string> = {}) => {
    const base = h.request(path, { method, cookie });
    const hd = new Headers(base.headers);
    for (const [k, v] of Object.entries(headers)) hd.set(k, v);
    return new Request(base.url, { method, headers: hd, body, ...(body ? { duplex: 'half' } : {}) } as RequestInit);
  };
  const form = (file: { bytes: Uint8Array; type: string; name?: string } | null, fields: Record<string, string> = {}) => {
    const f = new FormData();
    if (file) f.set('file', new File([file.bytes as BlobPart], file.name ?? 'photo', { type: file.type }));
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };
  const gp = (id: string) => `/garments/${id}/photos`;
  const photos = {
    upload: (cookie: string | undefined, id: string, file: { bytes: Uint8Array; type: string } | null, fields: Record<string, string> = {}) =>
      h.send((r) => http.uploadPhoto(r, id), raw(gp(id), cookie, 'POST', form(file, fields))),
    uploadRaw: (cookie: string | undefined, id: string, body: BodyInit, headers: Record<string, string>) =>
      h.send((r) => http.uploadPhoto(r, id), raw(gp(id), cookie, 'POST', body, headers)),
    list: (cookie: string | undefined, id: string) => call((r) => http.listPhotos(r, id), gp(id), cookie),
    primary: (cookie: string | undefined, id: string, pid: string) => call((r) => http.setPrimaryPhoto(r, id, pid), `${gp(id)}/${pid}/primary`, cookie, { method: 'PUT' }),
    remove: (cookie: string | undefined, id: string, pid: string) => call((r) => http.deletePhoto(r, id, pid), `${gp(id)}/${pid}`, cookie, { method: 'DELETE' }),
    cutout: (cookie: string | undefined, id: string, pid: string) => call((r) => http.cutoutPhoto(r, id, pid), `${gp(id)}/${pid}/cutout`, cookie, { method: 'POST' }),
    /** Raw response (binary body): not through h.send. */
    file: (cookie: string | undefined, id: string, pid: string, query = '') => http.photoFile(h.request(`${gp(id)}/${pid}/file${query}`, { cookie }), id, pid),
  };

  const shirt = (extra: Json = {}): Json => ({ categoryCode: 'TOPS', subtypeCode: 'SHIRT', primaryColor: { code: 'BLUE' }, ...extra });
  const etag = (res: { headers: Headers }) => res.headers.get('etag') as string;
  return { ...h, api, photos, storage, http, clock, ORIGIN, shirt, etag, wardrobeIdem: idem };
}
