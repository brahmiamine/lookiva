import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { assertSafeKey, type ObjectStorage } from './objects';

/** Private filesystem adapter. `root` must be outside `public/` (never served statically) and git-ignored. */
export class LocalObjectStorage implements ObjectStorage {
  private readonly root: string;
  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private file(key: string): string {
    assertSafeKey(key);
    const f = path.join(this.root, key);
    if (!f.startsWith(this.root + path.sep)) throw new Error('invalid storage key');
    return f;
  }

  /** The content type is not stored: the API derives it from the photo row. */
  async put(key: string, body: Uint8Array): Promise<void> {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true, mode: 0o700 });
    const tmp = `${f}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tmp, body, { mode: 0o600 });
    await rename(tmp, f); // atomic: readers never see a half-written object
  }

  async get(key: string): Promise<ReadableStream<Uint8Array> | null> {
    const f = this.file(key);
    if (!(await this.exists(key))) return null;
    return Readable.toWeb(createReadStream(f)) as unknown as ReadableStream<Uint8Array>;
  }

  async delete(key: string): Promise<void> {
    await rm(this.file(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    return stat(this.file(key)).then((s) => s.isFile(), () => false);
  }
}
