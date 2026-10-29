import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { AppError } from '@/platform/http/errors';
import { createRateLimiter } from '@/platform/rate-limit';
import { testRedisUrl } from '../setup/db-url';

const redis = new Redis(testRedisUrl());
afterAll(() => redis.quit());

const limit = { name: 'test', max: 3, windowMs: 60_000 };
const at = (ms: number) => new Date(Date.UTC(2026, 0, 1) + ms);

describe('fixed window rate limiter (real redis)', () => {
  it('allows_max_hits_then_429_RATE_LIMITED_with_retry_after', async () => {
    const rl = createRateLimiter(redis, `t-${randomUUID()}`);
    for (let i = 0; i < 3; i++) await rl.consume(limit, 'k', at(1_000));
    const err = await rl.consume(limit, 'k', at(20_000)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 429, code: 'RATE_LIMITED', headers: { 'Retry-After': '40' } });
  });

  it('next_window_starts_fresh', async () => {
    const rl = createRateLimiter(redis, `t-${randomUUID()}`);
    for (let i = 0; i < 3; i++) await rl.consume(limit, 'k', at(1_000));
    await expect(rl.consume(limit, 'k', at(60_000))).resolves.toBeUndefined();
  });

  it('ids_and_limit_names_are_independent', async () => {
    const rl = createRateLimiter(redis, `t-${randomUUID()}`);
    for (let i = 0; i < 3; i++) await rl.consume(limit, 'a', at(0));
    await expect(rl.consume(limit, 'b', at(0))).resolves.toBeUndefined();
    await expect(rl.consume({ ...limit, name: 'other' }, 'a', at(0))).resolves.toBeUndefined();
  });

  it('keys_expire_with_their_window', async () => {
    const prefix = `t-${randomUUID()}`;
    await createRateLimiter(redis, prefix).consume(limit, 'k', at(0));
    const [key] = await redis.keys(`${prefix}:*`);
    expect(key).toBeDefined();
    const ttl = await redis.pttl(key as string);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });

  it('concurrent_hits_are_counted_atomically', async () => {
    const rl = createRateLimiter(redis, `t-${randomUUID()}`);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => rl.consume(limit, 'k', at(0))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
  });
});
