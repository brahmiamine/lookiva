import { Queue as BullQueue } from 'bullmq';
import { Redis } from 'ioredis';
import type { Queue } from './port';

/**
 * BullMQ adapter. One BullMQ queue per queue name; the job name is the queue name.
 * `jobId` is passed through as BullMQ's jobId, so a duplicate add is ignored for as long as
 * the finished job is retained (24 h on success, 7 d on failure).
 */
export function createBullQueue(redisUrl: string): Queue & { close(): Promise<void> } {
  // Default retry policy on purpose: a Queue (producer) should fail fast when Redis is down.
  // Only Workers need maxRetriesPerRequest: null (see src/worker).
  const connection = new Redis(redisUrl);
  const queues = new Map<string, BullQueue>();
  const get = (name: string): BullQueue => {
    let q = queues.get(name);
    if (!q) queues.set(name, (q = new BullQueue(name, { connection })));
    return q;
  };

  return {
    async enqueue<T>(queue: string, payload: T, opts: { jobId?: string; delayMs?: number } = {}): Promise<void> {
      await get(queue).add(queue, payload, {
        jobId: opts.jobId,
        delay: opts.delayMs,
        removeOnComplete: { age: 86_400 },
        removeOnFail: { age: 604_800 },
      });
    },
    async close(): Promise<void> {
      await Promise.all([...queues.values()].map((q) => q.close()));
      connection.disconnect();
    },
  };
}
