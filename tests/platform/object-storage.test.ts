import { mkdtemp, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LocalObjectStorage } from '@/platform/storage/local';
import { MemoryObjectStorage } from '@/platform/storage/memory';
import type { ObjectStorage } from '@/platform/storage/objects';

const dir = await mkdtemp(path.join(os.tmpdir(), 'lookiva-store-'));
afterAll(() => rm(dir, { recursive: true, force: true }));
const text = async (s: ReadableStream<Uint8Array> | null) => (s ? new Response(s).text() : null);

describe.each([
  ['local', () => new LocalObjectStorage(path.join(dir, 'a'))],
  ['memory', () => new MemoryObjectStorage()],
] as [string, () => ObjectStorage][])('%s object storage', (_n, make) => {
  it('put_get_exists_delete_and_idempotent_delete', async () => {
    const s = make();
    expect(await s.exists('p/o/k.webp')).toBe(false);
    expect(await s.get('p/o/k.webp')).toBeNull();
    await s.put('p/o/k.webp', new TextEncoder().encode('hello'), 'text/plain');
    expect(await s.exists('p/o/k.webp')).toBe(true);
    expect(await text(await s.get('p/o/k.webp'))).toBe('hello');
    await s.put('p/o/k.webp', new TextEncoder().encode('v2'), 'text/plain'); // overwrite
    expect(await text(await s.get('p/o/k.webp'))).toBe('v2');
    await s.delete('p/o/k.webp');
    await s.delete('p/o/k.webp');
    expect(await s.exists('p/o/k.webp')).toBe(false);
  });

  it('refuses_keys_that_could_escape_the_root', async () => {
    const s = make();
    for (const k of ['../x', 'a/../../x', '/etc/passwd', 'a//b', 'a\\b', '', '.hidden/../x', 'a/./b']) {
      await expect(s.put(k, new Uint8Array([1]), 'x')).rejects.toThrow('invalid storage key');
    }
  });
});

it('local_adapter_leaves_no_temp_files_and_stays_in_its_root', async () => {
  const root = path.join(dir, 'b');
  const s = new LocalObjectStorage(root);
  await s.put('x/y', new Uint8Array([1, 2, 3]));
  expect(await readdir(path.join(root, 'x'))).toEqual(['y']);
});
