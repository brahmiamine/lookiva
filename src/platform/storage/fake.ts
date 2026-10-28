import type { Clock } from '../clock/port';
import type { Storage } from './port';

export class FakeStorage implements Storage {
  private readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  constructor(private readonly clock: Clock) {}

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
    return `fake://${key}?expires=${this.clock.now().getTime() + ttlSeconds * 1000}`;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  /** Test helper: resolves a signed URL, or null if expired or the object is gone. */
  fetchSigned(url: string): Uint8Array | null {
    const m = /^fake:\/\/(.*)\?expires=(\d+)$/.exec(url);
    if (!m || this.clock.now().getTime() > Number(m[2])) return null;
    return this.objects.get(m[1] ?? '')?.body ?? null;
  }
}
