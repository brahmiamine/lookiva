import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { newId } from './ids';
import { AppError } from './errors';

export const PENDING_TTL_MS = 5 * 60_000;

type Ctx = { userId: string; key: string; requestHash: string };
type Outcome<T> = { status: number; body: T };

// Verified against the MariaDB adapter: a duplicate key (ER_DUP_ENTRY 1062) surfaces as PrismaClientKnownRequestError P2002.
const isDuplicate = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Never holds a SQL transaction around `run`: pending row first, then run, then update. */
export async function withIdempotency<T>(
  db: PrismaClient,
  ctx: Ctx,
  run: () => Promise<Outcome<T>>,
  opts?: { now?: () => Date },
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
      const age = (opts?.now?.() ?? new Date()).getTime() - existing.createdAt.getTime();
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
  await db.idempotencyRecord.update({
    where: { id },
    data: { status: result.status, responseBody: (result.body ?? Prisma.JsonNull) as Prisma.InputJsonValue },
  });
  return { ...result, replayed: false };
}
