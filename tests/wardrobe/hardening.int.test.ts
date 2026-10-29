import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaGarmentStore } from '@/modules/wardrobe/infrastructure/prisma-store';
import type { MemoryObjectStorage } from '@/platform/storage/memory';
import { jpeg } from './fixtures';
import { closeAll, db, wardrobeHarness, type Json } from './harness';

afterAll(closeAll);

const JPEG = { type: 'image/jpeg' };
const DAY = 86_400_000;
const keysOf = (s: MemoryObjectStorage) => [...s.objects.keys()].sort();

async function setup(opts: Parameters<typeof wardrobeHarness>[0] = {}) {
  const h = wardrobeHarness(opts);
  const { cookie, userId } = await h.signedIn();
  const mk = async (extra: Json = {}) => (await h.api.createGarment(cookie, h.shirt(extra))).body as Json;
  const up = async (gid: string, bytes?: Uint8Array) => h.photos.upload(cookie, gid, { bytes: bytes ?? (await jpeg(40, 30)), ...JPEG });
  return { h, cookie, userId, mk, up };
}

describe('upload / cutout budget', () => {
  it('has_its_own_20_per_minute_limit_shared_by_upload_and_cutout', async () => {
    const { h, cookie, mk, up } = await setup();
    const g = await mk();
    const first = await up(g.id);
    expect(first.status).toBe(201);
    let cutouts = 0;
    for (let i = 0; i < 19; i++) cutouts += (await h.photos.cutout(cookie, g.id, first.body?.id as string)).status === 200 ? 1 : 0;
    expect(cutouts).toBe(19);
    const limited = await up(g.id);
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect((await h.photos.cutout(cookie, g.id, first.body?.id as string)).status).toBe(429);
    expect((await h.api.getGarment(cookie, g.id)).status).toBe(200); // other writes keep their own budget
    expect((await h.photos.list(cookie, g.id)).status).toBe(200);
  });
});

describe('caps and quota', () => {
  it('refuses_garments_beyond_the_per_user_cap_trash_included_and_frees_room_on_purge', async () => {
    const { h, cookie, mk } = await setup({ limits: { maxGarments: 3 } });
    h.clock.set(new Date('2017-01-01T00:00:00.000Z'));
    const g = [await mk(), await mk(), await mk()];
    const over = await h.api.createGarment(cookie, h.shirt());
    expect(over.status).toBe(409);
    expect(over.body).toMatchObject({ code: 'GARMENT_LIMIT_REACHED' });
    expect((await h.api.duplicate(cookie, g[0]?.id as string)).body).toMatchObject({ code: 'GARMENT_LIMIT_REACHED' });
    await h.api.deleteGarment(cookie, g[0]?.id);
    expect((await h.api.createGarment(cookie, h.shirt())).status).toBe(409); // trash still counts
    // another user is unaffected
    const other = (await h.signedIn()).cookie;
    expect((await h.api.createGarment(other, h.shirt())).status).toBe(201);
  });

  it('refuses_more_lists_than_the_per_kind_cap', async () => {
    const { h, cookie } = await setup({ limits: { maxGroups: 2 } });
    for (const kind of ['tags', 'collections', 'garmentSets'] as const) {
      const o = h.organizers[kind];
      expect((await o.create(cookie, 'a')).status).toBe(201);
      expect((await o.create(cookie, 'b')).status).toBe(201);
      const r = await o.create(cookie, 'c');
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ code: 'GROUP_LIMIT_REACHED' });
    }
  });

  it('enforces_the_photo_byte_quota_counting_shared_originals_once', async () => {
    const probe = await setup();
    const g0 = await probe.mk();
    const size = (await probe.up(g0.id)).body?.bytes as number;
    expect(size).toBeGreaterThan(0);
    const { h, cookie, mk, up } = await setup({ limits: { photoQuotaBytes: size * 2 + 10 } });
    const g = await mk();
    expect((await up(g.id)).status).toBe(201);
    // a duplicate that shares objects costs nothing
    const copy = (await h.api.duplicate(cookie, g.id, { copyPhotos: true })).body as Json;
    expect((await h.photos.list(cookie, copy.id)).body?.items).toHaveLength(1);
    expect((await up(g.id)).status).toBe(201);
    const full = await up(g.id);
    expect(full.status).toBe(409);
    expect(full.body).toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(keysOf(h.storage as MemoryObjectStorage)).toHaveLength(6); // nothing stored for the refused one
    // deleting frees room
    const ph = (await h.photos.list(cookie, g.id)).body?.items as Json[];
    await h.photos.remove(cookie, g.id, ph[1]?.id);
    expect((await up(g.id)).status).toBe(201);
  });
});

describe('purge re-check under lock', () => {
  it('does_not_purge_a_garment_restored_and_re_trashed_after_the_scan', async () => {
    const { h, cookie, mk } = await setup();
    const T = new Date('2016-01-01T00:00:00.000Z');
    h.clock.set(T);
    const g = await mk();
    await h.api.deleteGarment(cookie, g.id);
    const purgeAt = new Date(T.getTime() + 31 * DAY);
    let hooked = false;
    // The scan (findMany) returns g as due; right after it, g is restored and trashed again NOW (fresh purgeAfter).
    const spyDb = new Proxy(db, {
      get(target, prop) {
        const v = Reflect.get(target, prop, target);
        if (prop === 'garment') {
          return new Proxy(v, {
            get(t, p) {
              const f = Reflect.get(t, p, t);
              if (p !== 'findMany' || typeof f !== 'function') return typeof f === 'function' ? f.bind(t) : f;
              return async (...a: unknown[]) => {
                const rows = await f.apply(t, a);
                if (!hooked) {
                  hooked = true;
                  h.clock.set(new Date(T.getTime() + 29 * DAY));
                  expect((await h.api.restore(cookie, g.id)).status).toBe(200);
                  h.clock.set(purgeAt);
                  expect((await h.api.deleteGarment(cookie, g.id)).status).toBe(204);
                }
                return rows;
              };
            },
          });
        }
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const store = createPrismaGarmentStore(spyDb as typeof db);
    const r = await store.purgeExpired(purgeAt, 100);
    expect(hooked).toBe(true);
    expect(r.ids).not.toContain(g.id);
    expect(await db.garment.count({ where: { id: g.id } })).toBe(1);
    expect((await h.api.trash(cookie)).body?.items).toHaveLength(1);
  });
});

describe('list filters', () => {
  it('color_and_q_apply_together', async () => {
    const { h, cookie, mk } = await setup();
    const blueShirt = await mk({ nickname: 'Lin clair' });
    await mk({ nickname: 'Lin rouge', primaryColor: { code: 'RED' } });
    await mk({ nickname: 'Coton bleu' });
    const both = (await h.api.listGarments(cookie, '?color=BLUE&q=lin')).body?.items as Json[];
    expect(both.map((x) => x.id)).toEqual([blueShirt.id]);
    expect(((await h.api.listGarments(cookie, '?q=lin')).body?.items as Json[]).length).toBe(2);
    expect(((await h.api.listGarments(cookie, '?color=BLUE')).body?.items as Json[]).length).toBe(2);
  });
});

describe('file route headers and cutout serialisation', () => {
  it('sets_csp_sandbox_and_corp_same_origin', async () => {
    const { h, cookie, mk, up } = await setup();
    const g = await mk();
    const pid = (await up(g.id)).body?.id as string;
    for (const v of ['thumb', 'optimized', 'original']) {
      const r = await h.photos.file(cookie, g.id, pid, `?variant=${v}`);
      expect(r.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
      expect(r.headers.get('cross-origin-resource-policy')).toBe('same-origin');
      await r.arrayBuffer();
    }
  });

  it('parallel_cutouts_leave_exactly_one_cutout_object', async () => {
    const { h, cookie, mk, up } = await setup();
    const g = await mk();
    const pid = (await up(g.id)).body?.id as string;
    const rs = await Promise.all(Array.from({ length: 5 }, () => h.photos.cutout(cookie, g.id, pid)));
    expect(rs.every((r) => r.status === 200 && r.body?.cutoutStatus === 'READY')).toBe(true);
    expect(keysOf(h.storage as MemoryObjectStorage).filter((k) => k.includes('cutout-'))).toHaveLength(1);
    const row = await db.garmentPhoto.findUniqueOrThrow({ where: { id: pid } });
    expect(keysOf(h.storage as MemoryObjectStorage)).toContain(row.cutoutKey);
  });
});
