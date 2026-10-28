import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { newId } from './ids';
import type { OwnerId } from '../kernel';
import { AppError } from './errors';

export const PENDING_TTL_MS = 5 * 60_000;

type Ctx = { userId: OwnerId; key: string; requestHash: string };
type Outcome<T> = { status: number; body: T };

// Verified against the MariaDB adapter: a duplicate key (ER_DUP_ENTRY 1062) surfaces as PrismaClientKnownRequestError P2002.
const isDuplicate = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/**
 * Never holds a SQL transaction around `run`: pending row first, then run, then update.
 * Once `run` has succeeded its side effect happened, so the caller always gets the true result: if the
 * final write affects 0 rows (row reclaimed/removed meanwhile) or throws, nothing else is touched and the
 * problem is only reported through `opts.onPersistError`.
 * `opts.onPersistError` is required so every caller decides what to do with a lost result (log it, count it...).
 * A `run` result whose status is not an integer in 100..599 is a bug: nothing is stored, the key is released.
 * Known limit: a run longer than PENDING_TTL_MS can be reclaimed and executed twice.
 */
export async function withIdempotency<T extends Prisma.InputJsonValue>(
  db: PrismaClient,
  ctx: Ctx,
  run: () => Promise<Outcome<T>>,
  opts: { now?: () => Date; onPersistError: (e: unknown) => void },
): Promise<Outcome<T> & { replayed: boolean }> {
  const where = { userId_key: { userId: ctx.userId, key: ctx.key } };
  const tryInsert = async (): Promise<string | null> => {
    const id = newId();
    try {
      await db.idempotencyRecord.create({ data: { id, ...ctx, status: 0 } });
      return id;
    } catch (e) {
      if (isDuplicate(e)) return null;
      throw e;
    }
  };

  let id = await tryInsert();
  if (!id) {
    const existing = await db.idempotencyRecord.findUnique({ where });
    // Row vanished between the conflict and the read (failed run released it): retry once below.
    if (existing) {
      if (existing.requestHash !== ctx.requestHash) {
        throw new AppError('IDEMPOTENCY_KEY_REUSED', 422, 'Idempotency-Key was already used with a different request');
      }
      if (existing.status !== 0) {
        return { status: existing.status, body: existing.responseBody as T, replayed: true };
      }
      const age = (opts.now?.() ?? new Date()).getTime() - existing.createdAt.getTime();
      if (age < PENDING_TTL_MS) {
        throw new AppError('IDEMPOTENCY_IN_PROGRESS', 409, 'A request with this Idempotency-Key is still in progress');
      }
      // Stale pending: reclaim that exact row only if it is still pending.
      await db.idempotencyRecord.deleteMany({ where: { id: existing.id, status: 0 } });
    }
    id = await tryInsert();
    if (!id) {
      throw new AppError('IDEMPOTENCY_IN_PROGRESS', 409, 'A request with this Idempotency-Key is still in progress');
    }
  }

  let result: Outcome<T>;
  try {
    result = await run();
  } catch (e) {
    // Best effort: if the release fails, the stale pending row is reclaimed after PENDING_TTL_MS.
    await db.idempotencyRecord.deleteMany({ where: { id, status: 0 } }).catch(() => undefined);
    throw e;
  }
  const release = () => db.idempotencyRecord.deleteMany({ where: { id, status: 0 } }).catch(() => undefined);
  if (!Number.isInteger(result.status) || result.status < 100 || result.status > 599) {
    // Nothing is persisted (a 0 would read as "pending" forever): free the key and surface the bug.
    await release();
    throw new AppError('INVALID_RESPONSE_STATUS', 500, 'Handler returned an invalid HTTP status');
  }
  const report = (e: unknown) => {
    try {
      opts.onPersistError(e);
    } catch {
      // a failing callback must not turn a successful run into an error
    }
  };
  try {
    const { count } = await db.idempotencyRecord.updateMany({
      where: { id, status: 0 },
      data: { status: result.status, responseBody: result.body ?? Prisma.JsonNull },
    });
    if (count === 0) {
      report(new AppError('IDEMPOTENCY_NOT_PERSISTED', 500, 'Idempotency record was reclaimed before the result was stored'));
    }
  } catch (e) {
    report(e);
  }
  return { ...result, replayed: false };
}

/** Retention job: deletes COMPLETED records (status > 0) created before `olderThan`; pending rows are never touched. */
export async function purgeIdempotencyRecords(db: PrismaClient, olderThan: Date): Promise<number> {
  const { count } = await db.idempotencyRecord.deleteMany({ where: { status: { gt: 0 }, createdAt: { lt: olderThan } } });
  return count;
}
