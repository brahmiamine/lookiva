import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createBullQueue } from '@/platform/queue/bullmq';
import { startWorker } from '@/worker';

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6380';

describe('bullmq queue (real redis)', () => {
  const queue = createBullQueue(redisUrl);
  afterAll(() => queue.close());

  it('same_jobId_enqueued_twice_is_processed_once', async () => {
    const name = `test-${randomUUID()}`;
    const calls: unknown[] = [];
    const errors: unknown[] = [];
    const sentinelDone = Promise.withResolvers<void>();
    const worker = await startWorker({
      redisUrl,
      onError: (e) => void errors.push(e),
      handlers: {
        [name]: async (payload) => {
          if ((payload as { sentinel?: boolean }).sentinel) sentinelDone.resolve();
          else calls.push(payload);
        },
      },
    });
    try {
      await queue.enqueue(name, { n: 1 }, { jobId: 'same' });
      await queue.enqueue(name, { n: 2 }, { jobId: 'same' });
      // Sentinel is enqueued after both; the worker is sequential so once it ran, the duplicate would have too.
      await queue.enqueue(name, { sentinel: true }, { jobId: 'sentinel' });
      await sentinelDone.promise;
      expect(calls).toEqual([{ n: 1 }]);
      expect(errors).toEqual([]);
    } finally {
      await worker.close();
    }
  });
});
