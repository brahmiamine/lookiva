import { Worker } from 'bullmq';
import { Redis } from 'ioredis';

export type Handlers = Record<string, (payload: unknown) => Promise<void>>;

/** One BullMQ Worker per handler key (= queue name). Jobs are processed one at a time per queue. */
export async function startWorker(deps: {
  redisUrl: string;
  handlers: Handlers;
  /** Receives connection and worker errors (an EventEmitter 'error' without a listener would crash the process). */
  onError: (err: unknown) => void;
}): Promise<{ close(): Promise<void> }> {
  // BullMQ requires maxRetriesPerRequest: null on worker connections (blocking commands).
  const connection = new Redis(deps.redisUrl, { maxRetriesPerRequest: null });
  connection.on('error', deps.onError);
  const workers = Object.entries(deps.handlers).map(([queue, handler]) => {
    const w = new Worker(queue, (job) => handler(job.data), { connection });
    w.on('error', deps.onError);
    return w;
  });
  await Promise.all(workers.map((w) => w.waitUntilReady()));
  return {
    async close() {
      await Promise.all(workers.map((w) => w.close()));
      connection.disconnect();
    },
  };
}
