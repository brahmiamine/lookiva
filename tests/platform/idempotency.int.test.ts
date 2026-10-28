import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '@/platform/db';
import { AppError } from '@/platform/http/errors';
import { withIdempotency } from '@/platform/http/idempotency';
import { newId } from '@/platform/http/ids';
import { testDatabaseUrl } from '../setup/db-url';

const db = createDb(testDatabaseUrl());
const users: string[] = [];
const newUser = () => {
  const u = `test-${randomUUID()}`;
  users.push(u);
  return u;
};
const hash = (c: string) => c.repeat(64).slice(0, 64);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterAll(async () => {
  await db.idempotencyRecord.deleteMany({ where: { userId: { in: users } } });
  await db.$disconnect();
});

const rejection = async (p: Promise<unknown>): Promise<AppError> => {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
};

describe('withIdempotency (real mariadb)', () => {
  it('first_call_runs_and_stores', async () => {
    const userId = newUser();
    const ctx = { userId, key: 'k1', requestHash: hash('a') };
    const res = await withIdempotency(db, ctx, async () => ({ status: 201, body: { id: 'x' } }));
    expect(res).toEqual({ status: 201, body: { id: 'x' }, replayed: false });
    const row = await db.idempotencyRecord.findUniqueOrThrow({ where: { userId_key: { userId, key: 'k1' } } });
    expect(row).toMatchObject({ status: 201, responseBody: { id: 'x' }, requestHash: ctx.requestHash });
  });

  it('same_key_same_hash_replays_without_running', async () => {
    const ctx = { userId: newUser(), key: 'k1', requestHash: hash('a') };
    let calls = 0;
    const run = async () => ({ status: 201, body: { n: ++calls } });
    const first = await withIdempotency(db, ctx, run);
    const second = await withIdempotency(db, ctx, run);
    expect(calls).toBe(1);
    expect(first.replayed).toBe(false);
    expect(second).toEqual({ status: 201, body: { n: 1 }, replayed: true });
  });

  it('same_key_different_hash_is_422_IDEMPOTENCY_KEY_REUSED', async () => {
    const userId = newUser();
    await withIdempotency(db, { userId, key: 'k1', requestHash: hash('a') }, async () => ({
      status: 201,
      body: { secret: 'first-response' },
    }));
    let ran = false;
    const err = await rejection(
      withIdempotency(db, { userId, key: 'k1', requestHash: hash('b') }, async () => {
        ran = true;
        return { status: 201, body: {} };
      }),
    );
    expect(ran).toBe(false);
    expect(err.status).toBe(422);
    expect(err.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(JSON.stringify(err)).not.toContain('first-response');
  });

  it('two_concurrent_calls_run_once', async () => {
    const ctx = { userId: newUser(), key: 'k1', requestHash: hash('a') };
    let calls = 0;
    const run = async () => {
      calls++;
      await sleep(200);
      return { status: 201, body: { ok: true } };
    };
    const results = await Promise.allSettled([withIdempotency(db, ctx, run), withIdempotency(db, ctx, run)]);
    expect(calls).toBe(1);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const ko = results.filter((r) => r.status === 'rejected');
    expect(ok.length + ko.length).toBe(2);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const r of ko) {
      expect(r.reason).toBeInstanceOf(AppError);
      expect(r.reason).toMatchObject({ status: 409, code: 'IDEMPOTENCY_IN_PROGRESS' });
    }
    for (const r of ok.slice(1)) expect(r.value.replayed).toBe(true);
  });

  it('same_key_other_user_is_independent', async () => {
    const key = 'shared-key';
    let calls = 0;
    const run = async () => ({ status: 200, body: { n: ++calls } });
    const a = await withIdempotency(db, { userId: newUser(), key, requestHash: hash('a') }, run);
    const b = await withIdempotency(db, { userId: newUser(), key, requestHash: hash('a') }, run);
    expect(calls).toBe(2);
    expect([a.replayed, b.replayed]).toEqual([false, false]);
  });

  it('failed_run_releases_key_so_retry_runs', async () => {
    const ctx = { userId: newUser(), key: 'k1', requestHash: hash('a') };
    const boom = new Error('boom');
    await expect(
      withIdempotency(db, ctx, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(await db.idempotencyRecord.count({ where: { userId: ctx.userId } })).toBe(0);
    const res = await withIdempotency(db, ctx, async () => ({ status: 200, body: 'ok' }));
    expect(res).toEqual({ status: 200, body: 'ok', replayed: false });
  });

  it('stale_pending_record_is_reclaimed', async () => {
    const userId = newUser();
    const ctx = { userId, key: 'k1', requestHash: hash('a') };
    await db.idempotencyRecord.create({ data: { id: newId(), ...ctx, status: 0 } });
    // fresh pending record: still in progress
    expect(await rejection(withIdempotency(db, ctx, async () => ({ status: 200, body: 1 })))).toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_IN_PROGRESS',
    });
    const now = () => new Date(Date.now() + 10 * 60_000);
    const res = await withIdempotency(db, ctx, async () => ({ status: 200, body: 2 }), { now });
    expect(res).toEqual({ status: 200, body: 2, replayed: false });
  });

  it('createdAt_roundtrips_in_utc', async () => {
    const userId = newUser();
    const at = new Date('2026-01-15T23:30:45.123Z');
    await db.idempotencyRecord.create({
      data: { id: newId(), userId, key: 'k1', requestHash: hash('a'), status: 0, createdAt: at },
    });
    const row = await db.idempotencyRecord.findUniqueOrThrow({ where: { userId_key: { userId, key: 'k1' } } });
    expect(row.createdAt.toISOString()).toBe(at.toISOString());
    const [raw] = await db.$queryRaw<{ s: string }[]>`SELECT DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i:%s.%f') AS s FROM idempotency_records WHERE userId = ${userId}`;
    expect(raw?.s.startsWith('2026-01-15 23:30:45.123')).toBe(true);
    // DB-side default is UTC too (within a minute of the app clock)
    const k2 = await db.idempotencyRecord.create({
      data: { id: newId(), userId, key: 'k2', requestHash: hash('a'), status: 0 },
    });
    expect(Math.abs(k2.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
  });
  describe('exact key and user matching', () => {
    const runTwice = async (a: { userId: string; key: string }, b: { userId: string; key: string }) => {
      let calls = 0;
      const run = async () => ({ status: 201, body: { n: ++calls } });
      const ra = await withIdempotency(db, { ...a, requestHash: hash('a') }, run);
      const rb = await withIdempotency(db, { ...b, requestHash: hash('a') }, run);
      expect(calls).toBe(2);
      expect([ra.replayed, rb.replayed]).toEqual([false, false]);
    };

    it('keys_differing_only_by_case_are_independent', async () => {
      const userId = newUser();
      await runTwice({ userId, key: 'K1' }, { userId, key: 'k1' });
    });

    it('keys_differing_by_trailing_space_are_independent', async () => {
      const userId = newUser();
      await runTwice({ userId, key: 'k1' }, { userId, key: 'k1 ' });
    });

    it('userIds_differing_only_by_case_are_independent', async () => {
      const base = `test-${randomUUID()}`;
      users.push(base, base.toUpperCase());
      await runTwice({ userId: base, key: 'k1' }, { userId: base.toUpperCase(), key: 'k1' });
    });
  });

  describe('persisting the result after run', () => {
    it('row_reclaimed_during_run_does_not_overwrite_new_row', async () => {
      const userId = newUser();
      const ctx = { userId, key: 'k1', requestHash: hash('a') };
      const newRowId = newId();
      const reported: unknown[] = [];
      const res = await withIdempotency(
        db,
        ctx,
        async () => {
          // simulate another caller reclaiming the stale pending row while this run is still going
          await db.idempotencyRecord.deleteMany({ where: { userId, key: 'k1' } });
          await db.idempotencyRecord.create({ data: { id: newRowId, ...ctx, status: 0 } });
          return { status: 201, body: { mine: true } };
        },
        { onPersistError: (e) => reported.push(e) },
      );
      expect(res).toEqual({ status: 201, body: { mine: true }, replayed: false });
      expect(reported).toHaveLength(1);
      expect(reported[0]).toMatchObject({ code: 'IDEMPOTENCY_NOT_PERSISTED', status: 500 });
      const rows = await db.idempotencyRecord.findMany({ where: { userId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: newRowId, status: 0, responseBody: null });
    });

    it('update_failure_returns_result_and_reports', async () => {
      const userId = newUser();
      const failure = new Error('db went away');
      const failing = new Proxy(db, {
        get(target, prop) {
          const value: unknown = Reflect.get(target, prop);
          if (prop !== 'idempotencyRecord') return value;
          return new Proxy(value as object, {
            get(model, method) {
              if (method === 'updateMany') return () => Promise.reject(failure);
              const fn: unknown = Reflect.get(model, method);
              return typeof fn === 'function' ? fn.bind(model) : fn;
            },
          });
        },
      });
      const reported: unknown[] = [];
      const res = await withIdempotency(
        failing,
        { userId, key: 'k1', requestHash: hash('a') },
        async () => ({ status: 201, body: { ok: 1 } }),
        {
          onPersistError: (e) => {
            reported.push(e);
            throw new Error('callback failure is swallowed');
          },
        },
      );
      expect(res).toEqual({ status: 201, body: { ok: 1 }, replayed: false });
      expect(reported).toEqual([failure]);
    });
  });
});
