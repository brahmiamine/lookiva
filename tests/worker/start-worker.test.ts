import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const created: EventEmitter[] = [];
vi.mock('bullmq', () => ({
  Worker: class extends EventEmitter {
    constructor() {
      super();
      created.push(this);
    }
    async waitUntilReady() {}
    async close() {}
  },
}));
vi.mock('ioredis', () => ({
  Redis: class extends EventEmitter {
    constructor() {
      super();
      created.push(this);
    }
    disconnect() {}
  },
}));

describe('startWorker error listeners', () => {
  it('worker_and_connection_errors_go_to_onError_instead_of_crashing', async () => {
    const { startWorker } = await import('@/worker');
    const seen: unknown[] = [];
    const w = await startWorker({ redisUrl: 'redis://x', handlers: { q: async () => {} }, onError: (e) => void seen.push(e) });
    const boom = new Error('redis down');
    // An EventEmitter 'error' with no listener throws: this proves a listener is attached on every emitter.
    for (const emitter of created) expect(() => emitter.emit('error', boom)).not.toThrow();
    expect(created).toHaveLength(2);
    expect(seen).toEqual([boom, boom]);
    await w.close();
  });
});
