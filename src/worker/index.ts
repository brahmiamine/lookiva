import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

export type Handlers = Record<string, (payload: unknown) => Promise<void>>;

/** One BullMQ Worker per handler key (= queue name). Jobs are processed one at a time per queue. */
export async function startWorker(deps: {
  redisUrl: string;
  handlers: Handlers;
  /** Repeatable jobs: one BullMQ job scheduler per entry (upserted, so a restart never duplicates it). The queue must have a handler. */
  schedules?: { queue: string; everyMs: number }[];
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
  const queues = (deps.schedules ?? []).map((sc) => ({ sc, q: new Queue(sc.queue, { connection }) }));
  for (const { sc, q } of queues) {
    q.on('error', deps.onError);
    await q.upsertJobScheduler(`${sc.queue}-repeat`, { every: sc.everyMs }, { name: sc.queue, data: {}, opts: { removeOnComplete: { age: 86_400 }, removeOnFail: { age: 604_800 } } });
  }
  return {
    async close() {
      await Promise.all([...workers.map((w) => w.close()), ...queues.map(({ q }) => q.close())]);
      connection.disconnect();
    },
  };
}
