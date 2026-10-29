import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const upserts: unknown[][] = [];
vi.mock('bullmq', () => ({
  Worker: class extends EventEmitter {
    async waitUntilReady() {}
    async close() {}
  },
  Queue: class extends EventEmitter {
    constructor(readonly name: string) {
      super();
    }
    async upsertJobScheduler(...a: unknown[]) {
      upserts.push([this.name, ...a]);
    }
    async close() {}
  },
}));
vi.mock('ioredis', () => ({ Redis: class extends EventEmitter { disconnect() {} } }));

describe('startWorker schedules', () => {
  it('upserts_one_repeatable_job_per_schedule_with_a_stable_id', async () => {
    const { startWorker } = await import('@/worker');
    const w = await startWorker({ redisUrl: 'redis://x', handlers: { 'wardrobe-purge': async () => {} }, schedules: [{ queue: 'wardrobe-purge', everyMs: 86_400_000 }], onError: () => {} });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject(['wardrobe-purge', 'wardrobe-purge-repeat', { every: 86_400_000 }, { name: 'wardrobe-purge' }]);
    await w.close();
  });
});
