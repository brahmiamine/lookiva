import type { Redis } from 'ioredis';
import { AppError } from '../http/errors';

export type Limit = { name: string; max: number; windowMs: number };

export interface RateLimiter {
  /** Counts one hit for `id` under `limit`; throws 429 RATE_LIMITED (with Retry-After) past `max` in the window. */
  consume(limit: Limit, id: string, now: Date): Promise<void>;
}

/**
 * Fixed-window counter in Redis: one key per (limit, id, window index), INCR + PEXPIRE in one MULTI, so concurrent
 * hits are counted exactly and keys disappear with their window. Fails closed: a Redis error propagates (500).
 */
export function createRateLimiter(redis: Redis, prefix = 'rl'): RateLimiter {
  return {
    async consume(limit, id, now) {
      const t = now.getTime();
      const window = Math.floor(t / limit.windowMs);
      const key = `${prefix}:${limit.name}:${window}:${id}`;
      const res = await redis.multi().incr(key).pexpire(key, limit.windowMs).exec();
      const [err, count] = res?.[0] ?? [new Error('rate limiter: empty MULTI result'), 0];
      if (err) throw err;
      if ((count as number) > limit.max) {
        const retryAfter = Math.max(1, Math.ceil(((window + 1) * limit.windowMs - t) / 1000));
        throw new AppError('RATE_LIMITED', 429, 'Too many requests, retry later', undefined, {
          'Retry-After': String(retryAfter),
        });
      }
    },
  };
}
