import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '@/platform/db';
import { AppError } from '@/platform/http/errors';
import { purgeIdempotencyRecords, withIdempotency } from '@/platform/http/idempotency';
import { newId } from '@/platform/http/ids';
import { asOwnerId, type OwnerId } from '@/platform/kernel';
import { testDatabaseUrl } from '../setup/db-url';

const db = createDb(testDatabaseUrl());
const users: string[] = [];
const newUser = (): OwnerId => {
  const u = `test-${randomUUID()}`;
  users.push(u);
  return asOwnerId(u);
};
const noop = () => undefined;
const opts = { onPersistError: noop };
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
    const res = await withIdempotency(db, ctx, async () => ({ status: 201, body: { id: 'x' } }), opts);
    expect(res).toEqual({ status: 201, body: { id: 'x' }, replayed: false });
    const row = await db.idempotencyRecord.findUniqueOrThrow({ where: { userId_key: { userId, key: 'k1' } } });
    expect(row).toMatchObject({ status: 201, responseBody: { id: 'x' }, requestHash: ctx.requestHash });
  });

  it('same_key_same_hash_replays_without_running', async () => {
    const ctx = { userId: newUser(), key: 'k1', requestHash: hash('a') };
    let calls = 0;
    const run = async () => ({ status: 201, body: { n: ++calls } });
    const first = await withIdempotency(db, ctx, run, opts);
    const second = await withIdempotency(db, ctx, run, opts);
    expect(calls).toBe(1);
    expect(first.replayed).toBe(false);
    expect(second).toEqual({ status: 201, body: { n: 1 }, replayed: true });
  });

  it('same_key_different_hash_is_422_IDEMPOTENCY_KEY_REUSED', async () => {
    const userId = newUser();
    await withIdempotency(
      db,
      { userId, key: 'k1', requestHash: hash('a') },
      async () => ({ status: 201, body: { secret: 'first-response' } }),
      opts,
    );
    let ran = false;
    const err = await rejection(
      withIdempotency(db, { userId, key: 'k1', requestHash: hash('b') }, async () => {
        ran = true;
        return { status: 201, body: {} };
      }, opts),
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
    const results = await Promise.allSettled([withIdempotency(db, ctx, run, opts), withIdempotency(db, ctx, run, opts)]);
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
    const a = await withIdempotency(db, { userId: newUser(), key, requestHash: hash('a') }, run, opts);
    const b = await withIdempotency(db, { userId: newUser(), key, requestHash: hash('a') }, run, opts);
    expect(calls).toBe(2);
    expect([a.replayed, b.replayed]).toEqual([false, false]);
  });

  it('failed_run_releases_key_so_retry_runs', async () => {
    const ctx = { userId: newUser(), key: 'k1', requestHash: hash('a') };
    const boom = new Error('boom');
    await expect(
      withIdempotency(db, ctx, async () => {
        throw boom;
      }, opts),
    ).rejects.toBe(boom);
    expect(await db.idempotencyRecord.count({ where: { userId: ctx.userId } })).toBe(0);
    const res = await withIdempotency(db, ctx, async () => ({ status: 200, body: 'ok' }), opts);
    expect(res).toEqual({ status: 200, body: 'ok', replayed: false });
  });

  it('stale_pending_record_is_reclaimed', async () => {
    const userId = newUser();
    const ctx = { userId, key: 'k1', requestHash: hash('a') };
    await db.idempotencyRecord.create({ data: { id: newId(), ...ctx, status: 0 } });
    // fresh pending record: still in progress
    expect(await rejection(withIdempotency(db, ctx, async () => ({ status: 200, body: 1 }), opts))).toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_IN_PROGRESS',
    });
    const now = () => new Date(Date.now() + 10 * 60_000);
    const res = await withIdempotency(db, ctx, async () => ({ status: 200, body: 2 }), { ...opts, now });
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
  it('non_integer_or_out_of_range_status_is_rejected_and_key_released', async () => {
    const ctx = { userId: newUser(), key: 'k1', requestHash: hash('a') };
    for (const status of [0, 99, 600, 200.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      let ran = 0;
      const err: unknown = await withIdempotency(db, ctx, async () => (ran++, { status, body: { leaked: true } }), opts).then(
        () => undefined,
        (e: unknown) => e,
      );
      // a plain Error (a handler bug): withApi logs it at error level and answers 500
      expect(err, String(status)).toBeInstanceOf(Error);
      expect(err, String(status)).not.toBeInstanceOf(AppError);
      expect(ran).toBe(1);
      // nothing persisted and the key is free again
      expect(await db.idempotencyRecord.count({ where: { userId: ctx.userId } })).toBe(0);
    }
    const res = await withIdempotency(db, ctx, async () => ({ status: 200, body: 'fine' }), opts);
    expect(res).toEqual({ status: 200, body: 'fine', replayed: false });
  });

  it('purge_deletes_only_completed_records_older_than_cutoff', async () => {
    const userId = newUser();
    const old = new Date('2020-01-01T00:00:00.000Z');
    const cutoff = new Date('2021-01-01T00:00:00.000Z');
    const row = (key: string, status: number, createdAt: Date) =>
      db.idempotencyRecord.create({ data: { id: newId(), userId, key, requestHash: hash('a'), status, createdAt } });
    await row('old-done', 201, old);
    await row('old-pending', 0, old);
    await row('new-done', 201, new Date());
    expect(await purgeIdempotencyRecords(db, cutoff)).toBeGreaterThanOrEqual(1);
    const left = await db.idempotencyRecord.findMany({ where: { userId }, orderBy: { key: 'asc' } });
    expect(left.map((r) => r.key)).toEqual(['new-done', 'old-pending']);
  });

  describe('exact key and user matching', () => {
    const runTwice = async (a: { userId: OwnerId; key: string }, b: { userId: OwnerId; key: string }) => {
      let calls = 0;
      const run = async () => ({ status: 201, body: { n: ++calls } });
      const ra = await withIdempotency(db, { ...a, requestHash: hash('a') }, run, opts);
      const rb = await withIdempotency(db, { ...b, requestHash: hash('a') }, run, opts);
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
      await runTwice({ userId: asOwnerId(base), key: 'k1' }, { userId: asOwnerId(base.toUpperCase()), key: 'k1' });
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
        { onPersistError: (e) => void reported.push(e) },
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
