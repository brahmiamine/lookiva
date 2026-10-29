import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import type { BackgroundRemover } from '@/platform/background-remover/port';
import { MemoryObjectStorage } from '@/platform/storage/memory';
import { createLogger } from '@/platform/logger';
import { closeAll, db, wardrobeHarness, type Json } from './harness';
import { heic, jpeg, png } from './fixtures';

afterAll(closeAll);

class FlakyStorage extends MemoryObjectStorage {
  failPut: RegExp | null = null;
  failDelete = false;
  onPut: ((key: string) => Promise<void>) | null = null;
  override async put(key: string, body: Uint8Array, type: string) {
    if (this.failPut?.test(key)) throw new Error('disk full');
    await super.put(key, body, type);
    await this.onPut?.(key);
  }
  override async delete(key: string) {
    if (this.failDelete) throw new Error('disk gone');
    await super.delete(key);
  }
}

const JPEG = { type: 'image/jpeg' };
async function setup(opts: Parameters<typeof wardrobeHarness>[0] = {}) {
  const h = wardrobeHarness(opts);
  const { cookie } = await h.signedIn();
  const g = await h.api.createGarment(cookie, h.shirt());
  const gid = g.body?.id as string;
  const up = async (c = cookie, id = gid, bytes?: Uint8Array) => h.photos.upload(c, id, { bytes: bytes ?? (await jpeg()), ...JPEG });
  return { h, cookie, gid, up };
}
const keysOf = (s: MemoryObjectStorage) => [...s.objects.keys()].sort();

describe('limits', () => {
  it('lists_0_accepts_5_and_refuses_the_6th_before_reading_the_body', async () => {
    const { h, cookie, gid, up } = await setup();
    expect((await h.photos.list(cookie, gid)).body).toEqual({ items: [] });
    for (let i = 0; i < 5; i++) expect((await up()).status).toBe(201);
    const before = keysOf(h.storage as MemoryObjectStorage).length;
    expect(before).toBe(15);
    let pulled = 0;
    const body = new ReadableStream({ pull: (c) => { pulled++; c.enqueue(new Uint8Array(1024)); } });
    const sixth = await h.photos.uploadRaw(cookie, gid, body, { 'content-type': 'multipart/form-data; boundary=x' });
    expect(sixth.status).toBe(409);
    expect(sixth.body).toMatchObject({ code: 'PHOTO_LIMIT_REACHED' });
    expect(pulled).toBeLessThanOrEqual(1);
    expect((await up()).status).toBe(409);
    expect(keysOf(h.storage as MemoryObjectStorage).length).toBe(before);
    expect(((await h.photos.list(cookie, gid)).body?.items as Json[]).length).toBe(5);
  });

  it('refuses_a_file_over_10_MiB_with_413', async () => {
    const { h, cookie, gid } = await setup();
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 1);
    const res = await h.photos.upload(cookie, gid, { bytes: big, ...JPEG });
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('stops_pulling_an_endless_body_at_the_cap_without_content_length', async () => {
    const { h, cookie, gid } = await setup();
    let pulled = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream({ pull: (c) => { pulled++; c.enqueue(chunk); } });
    const res = await h.photos.uploadRaw(cookie, gid, body, { 'content-type': 'multipart/form-data; boundary=x' });
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThanOrEqual(13); // 10 MiB + framing allowance, never the whole (infinite) body
  });

  it('refuses_an_oversized_declared_content_length_without_reading', async () => {
    const { h, cookie, gid } = await setup();
    const res = await h.photos.uploadRaw(cookie, gid, new Uint8Array(10), { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(50 * 1024 * 1024) });
    expect(res.status).toBe(413);
  });
});

describe('content checks', () => {
  it('rejects_fake_mime_text_heic_bombs_and_missing_file', async () => {
    const { h, cookie, gid } = await setup();
    const t = (bytes: Uint8Array, type: string) => h.photos.upload(cookie, gid, { bytes, type });
    expect((await t(await png(), 'image/jpeg')).body).toMatchObject({ status: 415, code: 'MIME_MISMATCH' });
    expect((await t(await jpeg(), 'image/png')).status).toBe(415);
    expect((await t(Buffer.from('<script>alert(1)</script>'), 'image/jpeg')).body).toMatchObject({ code: 'UNSUPPORTED_IMAGE_FORMAT' });
    expect((await t(heic(), 'image/heic')).body).toMatchObject({ code: 'UNSUPPORTED_IMAGE_FORMAT' });
    expect((await h.photos.upload(cookie, gid, null)).status).toBe(400);
    expect((await h.photos.upload(cookie, gid, { bytes: await jpeg(), ...JPEG }, { rotate: '45' })).status).toBe(400);
    expect((await h.photos.upload(cookie, gid, { bytes: await jpeg(), ...JPEG }, { crop: '{"left":1}' })).status).toBe(400);
    expect((await h.photos.upload(cookie, gid, { bytes: await jpeg(60, 40), ...JPEG }, { crop: '{"left":50,"top":0,"width":20,"height":10}' })).status).toBe(400);
    expect((await h.photos.uploadRaw(cookie, gid, '{}', { 'content-type': 'application/json' })).status).toBe(415);
    expect((await h.photos.list(cookie, gid)).body).toEqual({ items: [] });
    expect(keysOf(h.storage as MemoryObjectStorage)).toEqual([]);
  });

  it('stores_the_untouched_original_privately_and_strips_gps_from_derivatives', async () => {
    const { h, cookie, gid, up } = await setup();
    const src = await jpeg(60, 40, { gps: true, orientation: 6 });
    const res = await up(cookie, gid, src);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ isPrimary: true, position: 1, mime: 'image/jpeg', bytes: src.length, width: 40, height: 60, cutoutStatus: null });
    expect(res.body).not.toHaveProperty('originalKey');
    expect(JSON.stringify(res.body)).not.toContain('photos/');
    const id = res.body?.id as string;
    const bytes = async (v: string) => Buffer.from(await (await h.photos.file(cookie, gid, id, `?variant=${v}`)).arrayBuffer());
    expect(await bytes('original')).toEqual(src);
    for (const v of ['optimized', 'thumb']) {
      const m = await sharp(await bytes(v)).metadata();
      expect(m.exif).toBeUndefined();
      expect(m).toMatchObject({ format: 'webp', width: 40, height: 60 });
    }
  });

  it('applies_rotate_and_crop_params', async () => {
    const { h, cookie, gid } = await setup();
    const r = await h.photos.upload(cookie, gid, { bytes: await jpeg(60, 40), ...JPEG }, { rotate: '90', crop: '{"left":0,"top":0,"width":40,"height":30}' });
    expect(r.body).toMatchObject({ width: 40, height: 30 });
  });
});

describe('primary photo', () => {
  it('first_is_primary_switch_is_atomic_and_deleting_the_primary_promotes_the_next', async () => {
    const { h, cookie, gid, up } = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await up()).body?.id as string);
    const primaries = async () => ((await h.photos.list(cookie, gid)).body?.items as Json[]).filter((p) => p.isPrimary).map((p) => p.id);
    expect(await primaries()).toEqual([ids[0]]);
    const sw = await h.photos.primary(cookie, gid, ids[2] as string);
    expect(sw.status).toBe(200);
    expect(sw.body).toMatchObject({ id: ids[2], isPrimary: true });
    expect(await primaries()).toEqual([ids[2]]);
    expect((await h.photos.primary(cookie, gid, ids[2] as string)).status).toBe(200); // idempotent
    await Promise.all([h.photos.primary(cookie, gid, ids[0] as string), h.photos.primary(cookie, gid, ids[1] as string)]);
    expect((await primaries()).length).toBe(1);
    const p = (await primaries())[0] as string;
    expect((await h.photos.remove(cookie, gid, p)).status).toBe(204);
    const left = (await h.photos.list(cookie, gid)).body?.items as Json[];
    expect(left).toHaveLength(2);
    expect(left.filter((x) => x.isPrimary)).toHaveLength(1);
    expect(left.find((x) => x.isPrimary)?.position).toBe(Math.min(...left.map((x) => x.position)));
    // the database itself refuses a second primary
    await expect(db.garmentPhoto.update({ where: { id: (left.find((x) => !x.isPrimary) as Json).id }, data: { primarySlot: 1 } })).rejects.toThrow();
  });

  it('a_removed_photo_frees_its_slot_for_a_new_upload', async () => {
    const { h, cookie, gid, up } = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await up()).body?.id as string);
    await h.photos.remove(cookie, gid, ids[1] as string);
    const again = await up();
    expect(again.status).toBe(201);
    expect(again.body?.position).toBe(6);
    expect((await up()).status).toBe(409);
  });
});

describe('deletion and shared objects', () => {
  it('delete_removes_the_row_then_the_objects', async () => {
    const { h, cookie, gid, up } = await setup();
    const id = (await up()).body?.id as string;
    expect(keysOf(h.storage as MemoryObjectStorage)).toHaveLength(3);
    expect((await h.photos.remove(cookie, gid, id)).status).toBe(204);
    expect(keysOf(h.storage as MemoryObjectStorage)).toEqual([]);
    expect((await h.photos.remove(cookie, gid, id)).status).toBe(404);
  });

  it('copy_shares_objects_and_deleting_one_photo_keeps_them_until_the_last_reference', async () => {
    const { h, cookie, gid, up } = await setup();
    const g2 = (await h.api.createGarment(cookie, h.shirt())).body?.id as string;
    const src = (await up()).body?.id as string;
    await up();
    const svc = h.http.photoService(createLogger({ level: 'silent' }));
    const owner = (await db.garment.findUniqueOrThrow({ where: { id: gid } })).ownerId as never;
    expect(await svc.copyPhotosToGarment(owner, gid, g2)).toBe(2);
    await expect(svc.copyPhotosToGarment(owner, gid, g2)).rejects.toMatchObject({ code: 'TARGET_HAS_PHOTOS' });
    expect(keysOf(h.storage as MemoryObjectStorage)).toHaveLength(6); // shared, not duplicated
    const copy = ((await h.photos.list(cookie, g2)).body?.items as Json[]);
    expect(copy.map((p) => [p.position, p.isPrimary])).toEqual([[1, true], [2, false]]);

    expect((await h.photos.remove(cookie, gid, src)).status).toBe(204);
    expect(keysOf(h.storage as MemoryObjectStorage)).toHaveLength(6); // the copy still references them
    expect((await h.photos.file(cookie, g2, copy[0]?.id, '?variant=original')).status).toBe(200);
    expect((await h.photos.remove(cookie, g2, copy[0]?.id)).status).toBe(204);
    expect(keysOf(h.storage as MemoryObjectStorage)).toHaveLength(3); // last reference gone -> objects gone
  });

  it('storage_failure_after_commit_still_answers_204_and_logs_a_purge_candidate', async () => {
    const storage = new FlakyStorage();
    const { h, cookie, gid, up } = await setup({ storage });
    const id = (await up()).body?.id as string;
    storage.failDelete = true;
    expect((await h.photos.remove(cookie, gid, id)).status).toBe(204);
    expect((await h.photos.list(cookie, gid)).body).toEqual({ items: [] });
    expect(h.logs()).toContain('photo.storage.purge_candidate');
    expect(h.logs()).toContain(`photos/`);
    expect(storage.objects.size).toBe(3); // left behind on purpose: findable, never silently lost
  });
});

describe('compensation', () => {
  it('a_failing_storage_write_leaves_no_row_and_no_orphan', async () => {
    const storage = new FlakyStorage();
    storage.failPut = /thumb/;
    const { h, gid, up } = await setup({ storage });
    const res = await up();
    expect(res.status).toBe(500);
    expect(storage.objects.size).toBe(0); // original + optimized were written, then removed
    expect(await db.garmentPhoto.count({ where: { garmentId: gid } })).toBe(0);
    storage.failPut = null;
    expect((await up()).status).toBe(201);
    void h;
  });

  it('a_failed_database_insert_removes_the_objects_that_were_written', async () => {
    const storage = new FlakyStorage();
    const { h, gid, up } = await setup({ storage });
    storage.onPut = async (key) => {
      if (key.endsWith('thumb.webp')) await db.garment.delete({ where: { id: gid } }); // garment disappears mid-upload
    };
    const res = await up();
    expect(res.status).toBe(404);
    expect(storage.objects.size).toBe(0);
    void h;
  });
});

describe('access control', () => {
  it('another_user_gets_404_everywhere_and_anonymous_401', async () => {
    const { h, cookie, gid, up } = await setup();
    const pid = (await up()).body?.id as string;
    const other = (await h.signedIn()).cookie;
    const before = keysOf(h.storage as MemoryObjectStorage);
    expect((await h.photos.list(other, gid)).status).toBe(404);
    expect((await h.photos.upload(other, gid, { bytes: await jpeg(), ...JPEG })).status).toBe(404);
    expect((await h.photos.primary(other, gid, pid)).status).toBe(404);
    expect((await h.photos.cutout(other, gid, pid)).status).toBe(404);
    expect((await h.photos.remove(other, gid, pid)).status).toBe(404);
    const f = await h.photos.file(other, gid, pid);
    expect(f.status).toBe(404);
    expect(await f.text()).not.toContain('RIFF');
    expect(keysOf(h.storage as MemoryObjectStorage)).toEqual(before);
    // own garment, other user's photo id
    const g2 = (await h.api.createGarment(other, h.shirt())).body?.id as string;
    expect((await h.photos.file(other, g2, pid)).status).toBe(404);
    expect((await h.photos.list(undefined, gid)).status).toBe(401);
    expect((await h.photos.file(undefined, gid, pid)).status).toBe(401);
    expect((await h.photos.list(cookie, 'not-a-uuid')).status).toBe(404);
  });

  it('trashed_garment_photos_answer_404', async () => {
    const { h, cookie, gid, up } = await setup();
    const pid = (await up()).body?.id as string;
    await h.api.deleteGarment(cookie, gid);
    expect((await h.photos.list(cookie, gid)).status).toBe(404);
    expect((await h.photos.file(cookie, gid, pid)).status).toBe(404);
  });

  it('file_is_streamed_with_private_headers_and_a_validated_variant', async () => {
    const { h, cookie, gid, up } = await setup();
    const pid = (await up()).body?.id as string;
    for (const [v, type] of [['thumb', 'image/webp'], ['optimized', 'image/webp'], ['original', 'image/jpeg']] as const) {
      const r = await h.photos.file(cookie, gid, pid, `?variant=${v}`);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toBe(type);
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('content-disposition')).toMatch(/^inline/);
      expect(r.headers.get('cache-control')).toContain('no-store');
      expect(r.headers.get('location')).toBeNull();
      await r.arrayBuffer();
    }
    expect((await h.photos.file(cookie, gid, pid)).headers.get('content-type')).toBe('image/webp'); // default = optimized
    expect((await h.photos.file(cookie, gid, pid, '?variant=huge')).status).toBe(400);
    expect((await h.photos.file(cookie, gid, pid, '?variant=cutout')).status).toBe(404); // none yet
  });
});

describe('cutout', () => {
  it('local_removal_stores_a_transparent_png_and_replaces_the_previous_one', async () => {
    const { h, cookie, gid } = await setup();
    const white = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ffffff' } }).composite([{ input: await sharp({ create: { width: 10, height: 20, channels: 3, background: '#aa0000' } }).png().toBuffer(), left: 10, top: 0 }]).jpeg({ quality: 100 }).toBuffer();
    const pid = (await h.photos.upload(cookie, gid, { bytes: white, ...JPEG })).body?.id as string;
    const c1 = await h.photos.cutout(cookie, gid, pid);
    expect(c1.status).toBe(200);
    expect(c1.body).toMatchObject({ cutoutStatus: 'READY' });
    const r = await h.photos.file(cookie, gid, pid, '?variant=cutout');
    expect(r.headers.get('content-type')).toBe('image/png');
    const { data, info } = await sharp(Buffer.from(await r.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0); // top-left white -> transparent
    expect(data[(info.width - 1) * 4 + 3]).toBe(255); // red side kept
    const n = (h.storage as MemoryObjectStorage).objects.size;
    expect((await h.photos.cutout(cookie, gid, pid)).body).toMatchObject({ cutoutStatus: 'READY' });
    expect((h.storage as MemoryObjectStorage).objects.size).toBe(n); // old cutout object released
    await h.photos.remove(cookie, gid, pid);
    expect((h.storage as MemoryObjectStorage).objects.size).toBe(0);
  });

  it('a_failing_remover_reports_FAILED_and_keeps_the_photo', async () => {
    const remover: BackgroundRemover = { remove: async () => { throw new Error('model crashed'); } };
    const { h, cookie, gid, up } = await setup({ remover });
    const pid = (await up()).body?.id as string;
    const res = await h.photos.cutout(cookie, gid, pid);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: pid, cutoutStatus: 'FAILED' });
    expect((await h.photos.file(cookie, gid, pid, '?variant=original')).status).toBe(200);
    expect((await h.photos.file(cookie, gid, pid, '?variant=cutout')).status).toBe(404);
    expect(((await h.photos.list(cookie, gid)).body?.items as Json[])[0]).toMatchObject({ cutoutStatus: 'FAILED' });
  });
});
