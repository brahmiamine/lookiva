import { randomUUID } from 'node:crypto';
import { createGarmentGateway, type GarmentGateway } from '@/modules/wardrobe';
import { createOutfitsHttp, createOutfitUsageChecker } from '@/modules/outfits';
import { redis } from '../identity/harness';
import { closeAll, db, wardrobeHarness, type Json } from '../wardrobe/harness';

export { closeAll, db };
export type { Json };
export const UNKNOWN = '00000000-0000-4000-8000-000000000000';

/** Wardrobe harness (real sessions + garments) plus the outfits API on the same db/redis. `wrap` lets a test break the garment gateway. */
export function outfitsHarness(opts: { wrap?: (real: GarmentGateway) => GarmentGateway } = {}) {
  const h = wardrobeHarness({ usage: createOutfitUsageChecker(db) });
  const real = createGarmentGateway(db, h.clock);
  const http = createOutfitsHttp({ db, redis, clock: h.clock, withSession: h.withSession, garments: opts.wrap ? opts.wrap(real) : real, rateLimitPrefix: `rl-o-${randomUUID()}` });
  const idem = () => ({ 'idempotency-key': `k-${randomUUID()}` });
  const call = (handler: (r: Request) => Promise<Response>, path: string, cookie: string | undefined, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
    h.send(handler, h.request(path, { cookie, ...init }));
  const im = (v?: string): Record<string, string> => (v === undefined ? {} : { 'if-match': v });

  const api = {
    create: (c: string | undefined, body: unknown, headers: Record<string, string> = idem()) => call(http.createOutfit, '/outfits', c, { method: 'POST', body, headers }),
    list: (c: string | undefined, q = '') => call(http.listOutfits, `/outfits${q}`, c),
    get: (c: string | undefined, id: string) => call((r) => http.getOutfit(r, id), `/outfits/${id}`, c),
    patch: (c: string | undefined, id: string, body: unknown, ifMatch?: string) => call((r) => http.patchOutfit(r, id), `/outfits/${id}`, c, { method: 'PATCH', body, headers: im(ifMatch) }),
    cancel: async (c: string | undefined, id: string, ifMatch = 'auto') => {
      const m = ifMatch === 'auto' ? ((await call((r) => http.getOutfit(r, id), `/outfits/${id}`, c)).headers.get('etag') ?? undefined) : ifMatch === '' ? undefined : ifMatch;
      return call((r) => http.cancelOutfit(r, id), `/outfits/${id}`, c, { method: 'DELETE', headers: im(m) });
    },
    addItem: (c: string | undefined, id: string, body: unknown, ifMatch?: string) => call((r) => http.addItem(r, id), `/outfits/${id}/items`, c, { method: 'POST', body, headers: im(ifMatch) }),
    removeItem: (c: string | undefined, id: string, gid: string, ifMatch?: string) => call((r) => http.removeItem(r, id, gid), `/outfits/${id}/items/${gid}`, c, { method: 'DELETE', headers: im(ifMatch) }),
    replaceItem: (c: string | undefined, id: string, gid: string, body: unknown, ifMatch?: string) => call((r) => http.replaceItem(r, id, gid), `/outfits/${id}/items/${gid}`, c, { method: 'PUT', body, headers: im(ifMatch) }),
    conflicts: (c: string | undefined, id: string) => call((r) => http.conflicts(r, id), `/outfits/${id}/conflicts`, c),
    confirm: (c: string | undefined, id: string, body: unknown, headers: Record<string, string> = idem()) => call((r) => http.confirmWorn(r, id), `/outfits/${id}/confirm-worn`, c, { method: 'POST', body, headers }),
    saveAsTemplate: (c: string | undefined, id: string, body: unknown, headers: Record<string, string> = idem()) => call((r) => http.saveAsTemplate(r, id), `/outfits/${id}/save-as-template`, c, { method: 'POST', body, headers }),
    lastWorn: (c: string | undefined, q = '') => call(http.lastWorn, `/outfits/last-worn${q}`, c),
    wear: (c: string | undefined, id: string) => call((r) => http.getWearRecord(r, id), `/wear-records/${id}`, c),
    wash: (c: string | undefined, id: string, body: unknown, headers: Record<string, string> = idem()) => call((r) => http.markToWash(r, id), `/wear-records/${id}/mark-to-wash`, c, { method: 'POST', body, headers }),
    invalidate: (c: string | undefined, id: string, body: unknown, ifMatch?: string) => call((r) => http.invalidateWearRecord(r, id), `/wear-records/${id}/invalidate`, c, { method: 'POST', body, headers: im(ifMatch) }),
    wearHistory: (c: string | undefined, gid: string, q = '') => call((r) => http.garmentWearHistory(r, gid), `/garments/${gid}/wear-history${q}`, c),
    tCreate: (c: string | undefined, body: unknown, headers: Record<string, string> = idem()) => call(http.createTemplate, '/outfit-templates', c, { method: 'POST', body, headers }),
    tList: (c: string | undefined, q = '') => call(http.listTemplates, `/outfit-templates${q}`, c),
    tGet: (c: string | undefined, id: string) => call((r) => http.getTemplate(r, id), `/outfit-templates/${id}`, c),
    tPatch: (c: string | undefined, id: string, body: unknown, ifMatch?: string) => call((r) => http.patchTemplate(r, id), `/outfit-templates/${id}`, c, { method: 'PATCH', body, headers: im(ifMatch) }),
    tDelete: (c: string | undefined, id: string) => call((r) => http.deleteTemplate(r, id), `/outfit-templates/${id}`, c, { method: 'DELETE' }),
    instantiate: (c: string | undefined, id: string, body: unknown, headers: Record<string, string> = idem()) => call((r) => http.instantiateTemplate(r, id), `/outfit-templates/${id}/instantiate`, c, { method: 'POST', body, headers }),
  };

  /** A signed-in user with a garment factory. */
  const user = async () => {
    const u = await h.signedIn();
    const garment = async (extra: Json = {}): Promise<Json> => (await h.api.createGarment(u.cookie, h.shirt(extra))).body as Json;
    return { ...u, garment };
  };
  return { ...h, o: api, user, idem, ohttp: http };
}
