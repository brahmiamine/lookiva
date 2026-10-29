/**
 * Private object storage for user files (photos). Keys are opaque, relative and slash separated; objects are never
 * public and have no durable URL: the API streams them to their owner after a session check.
 * Adapters: LocalObjectStorage (private directory, dev/test/single node), MemoryObjectStorage (unit tests).
 * S3 (private bucket, SSE, presigned GET with a ~60 s TTL minted per authorised request) is NOT implemented: provider
 * choice and spend are a phase 12 decision. It only has to implement this interface; no caller changes.
 */
export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** null = no such object. */
  get(key: string): Promise<ReadableStream<Uint8Array> | null>;
  /** Idempotent: deleting a missing object succeeds. */
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
/** Rejects absolute paths, `..`, empty segments, backslashes and anything outside [A-Za-z0-9._-/]. */
export function assertSafeKey(key: string): void {
  if (key.length > 255 || !KEY_RE.test(key) || key.split('/').includes('..')) throw new Error('invalid storage key');
}
