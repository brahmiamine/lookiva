import { Redis } from 'ioredis';
import { createDb } from '@/platform/db';

/** Short-lived connection per call: readiness must reflect a fresh connect, not a warm pool. */
export function makeDbCheck(url: string): () => Promise<void> {
  return async () => {
    const db = createDb(url);
    try {
      await db.$queryRaw`SELECT 1`;
    } finally {
      await db.$disconnect().catch(() => undefined);
    }
  };
}

export function makeRedisCheck(url: string): () => Promise<void> {
  return async () => {
    const redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      retryStrategy: () => null, // fail fast, no background reconnect loop
    });
    redis.on('error', () => undefined); // surfaced through the rejected promise below
    try {
      await redis.connect();
      await redis.ping();
    } finally {
      redis.disconnect();
    }
  };
}
