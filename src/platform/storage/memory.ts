import { assertSafeKey, type ObjectStorage } from './objects';

/** In-memory adapter for unit tests. */
export class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    assertSafeKey(key);
    this.objects.set(key, { body, contentType });
  }

  async get(key: string): Promise<ReadableStream<Uint8Array> | null> {
    const o = this.objects.get(key);
    if (!o) return null;
    return new ReadableStream({ start: (c) => { c.enqueue(o.body); c.close(); } });
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
}
