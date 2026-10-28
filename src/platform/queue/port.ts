export interface Queue {
  /** `jobId` is the idempotence key: enqueuing the same jobId twice is a no-op. */
  enqueue<T>(queue: string, payload: T, opts?: { jobId?: string; delayMs?: number }): Promise<void>;
}
