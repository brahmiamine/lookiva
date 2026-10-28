import type { Queue } from './port';

export type FakeJob = { queue: string; payload: unknown; jobId?: string; delayMs?: number };

export class FakeQueue implements Queue {
  readonly jobs: FakeJob[] = [];
  private readonly seen = new Set<string>();

  async enqueue<T>(queue: string, payload: T, opts: { jobId?: string; delayMs?: number } = {}): Promise<void> {
    if (opts.jobId !== undefined) {
      const key = `${queue}:${opts.jobId}`;
      if (this.seen.has(key)) return;
      this.seen.add(key);
    }
    this.jobs.push({ queue, payload, ...opts });
  }
}
