import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from '@/platform/http/errors';
import type { Logger } from '@/platform/logger';
import type { z } from 'zod';
import type { readyResponseSchema } from './schemas';

type Check = () => Promise<void>;
type Deps = { token: string; checks: { db: Check; redis: Check }; timeoutMs?: number };

const sha256 = (s: string) => createHash('sha256').update(s).digest();

// Hashing first gives equal-length buffers, so timingSafeEqual never throws on length mismatch.
const tokenMatches = (given: string, expected: string) => timingSafeEqual(sha256(given), sha256(expected));

async function withTimeout(check: Check, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
  });
  try {
    await Promise.race([check(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createReadyHandler(deps: Deps) {
  const timeoutMs = deps.timeoutMs ?? 2500;
  return async (req: Request, ctx: { requestId: string; log: Logger }): Promise<Response> => {
    const given = /^Bearer (.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
    if (given === undefined || !tokenMatches(given, deps.token)) {
      throw new AppError('UNAUTHORIZED', 401, 'Authentication required');
    }
    const names = ['db', 'redis'] as const;
    const results = await Promise.allSettled(names.map((n) => withTimeout(deps.checks[n], timeoutMs)));
    const failed = names.filter((_, i) => results[i]?.status === 'rejected');
    for (const dependency of failed) {
      const r = results[names.indexOf(dependency)] as PromiseRejectedResult;
      ctx.log.warn({ dependency, err: r.reason }, 'readiness check failed');
    }
    if (failed.length > 0) {
      throw new AppError(
        'NOT_READY',
        503,
        'Service not ready',
        failed.map((path) => ({ path, message: 'unavailable' })),
      );
    }
    const body: z.infer<typeof readyResponseSchema> = { status: 'ok', checks: { db: 'ok', redis: 'ok' } };
    return Response.json(body);
  };
}
