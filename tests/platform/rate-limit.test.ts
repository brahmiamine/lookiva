import type { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/platform/http/errors';
import { createRateLimiter } from '@/platform/rate-limit';

describe('rate limiter failure', () => {
  it('redis_failure_fails_closed_as_503_RATE_LIMITER_UNAVAILABLE', async () => {
    const broken = { multi: () => ({ incr: () => ({ pexpire: () => ({ exec: () => Promise.reject(new Error('ECONNREFUSED 10.0.0.1:6379')) }) }) }) };
    const err = await createRateLimiter(broken as unknown as Redis).consume({ name: 'x', max: 1, windowMs: 1000 }, 'k', new Date()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 503, code: 'RATE_LIMITER_UNAVAILABLE' });
    expect((err as Error).cause).toBeInstanceOf(Error); // kept for the log, never sent (problem detail is fixed)
  });
});
