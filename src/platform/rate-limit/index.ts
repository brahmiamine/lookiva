import type { Redis } from 'ioredis';
import { AppError } from '../http/errors';

export type Limit = { name: string; max: number; windowMs: number };

export interface RateLimiter {
  /** Counts one hit for `id` under `limit`; throws 429 RATE_LIMITED (with Retry-After) past `max` in the window. */
  consume(limit: Limit, id: string, now: Date): Promise<void>;
}

/**
 * Fixed-window counter in Redis: one key per (limit, id, window index), INCR + PEXPIRE in one MULTI, so concurrent
 * hits are counted exactly and keys disappear with their window. Fails closed: a Redis error becomes 503 RATE_LIMITER_UNAVAILABLE.
 */
export function createRateLimiter(redis: Redis, prefix = 'rl'): RateLimiter {
  return {
    async consume(limit, id, now) {
      const t = now.getTime();
      const window = Math.floor(t / limit.windowMs);
      const key = `${prefix}:${limit.name}:${window}:${id}`;
      let count: number;
      try {
        const res = await redis.multi().incr(key).pexpire(key, limit.windowMs).exec();
        const [err, value] = res?.[0] ?? [new Error('rate limiter: empty MULTI result'), 0];
        if (err) throw err;
        count = value as number;
      } catch (e) {
        // Fail closed, but as an expected 503 (the cause is kept for the log, the client sees a fixed problem).
        throw Object.assign(new AppError('RATE_LIMITER_UNAVAILABLE', 503, 'Temporarily unavailable, retry later'), { cause: e });
      }
      if (count > limit.max) {
        const retryAfter = Math.max(1, Math.ceil(((window + 1) * limit.windowMs - t) / 1000));
        throw new AppError('RATE_LIMITED', 429, 'Too many requests, retry later', undefined, {
          'Retry-After': String(retryAfter),
        });
      }
    },
  };
}
