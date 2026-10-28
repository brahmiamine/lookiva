import { Worker } from 'bullmq';
import { Redis } from 'ioredis';

export type Handlers = Record<string, (payload: unknown) => Promise<void>>;

/** One BullMQ Worker per handler key (= queue name). Jobs are processed one at a time per queue. */
export async function startWorker(deps: {
  redisUrl: string;
  handlers: Handlers;
}): Promise<{ close(): Promise<void> }> {
  // BullMQ requires maxRetriesPerRequest: null on worker connections (blocking commands).
  const connection = new Redis(deps.redisUrl, { maxRetriesPerRequest: null });
  const workers = Object.entries(deps.handlers).map(
    ([queue, handler]) => new Worker(queue, (job) => handler(job.data), { connection }),
  );
  await Promise.all(workers.map((w) => w.waitUntilReady()));
  return {
    async close() {
      await Promise.all(workers.map((w) => w.close()));
      connection.disconnect();
    },
  };
}
