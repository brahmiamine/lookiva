import { afterAll, describe, expect, it } from 'vitest';
import { newId } from '@/platform/http/ids';
import { asOwnerId } from '@/platform/kernel';
import { createPrismaIdentityStore } from '@/modules/identity/infrastructure/prisma-store';
import { closeAll, db, harness, PASSWORD, shape } from './harness';

afterAll(closeAll);

const statusOf = async (userId: string) => (await db.user.findUniqueOrThrow({ where: { id: userId } })).status;
const liveSessions = (userId: string) => db.sessionRegistry.count({ where: { userId, revokedAt: null } });

describe('re-authentication on sensitive actions', () => {
  it('a_wrong_password_is_401_INVALID_CREDENTIALS_and_changes_nothing', async () => {
    const h = harness();
    const a = await h.signedIn();
    for (const call of [h.api.deactivate, h.api.requestDeletion]) {
      const res = await call(a.cookie, 'not the password at all');
      expect(res.body).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
      expect(res.headers.getSetCookie()).toEqual([]);
    }
    expect(await statusOf(a.userId)).toBe('ACTIVE');
    expect(await liveSessions(a.userId)).toBe(1);
    expect((await h.api.me(a.cookie)).status).toBe(200);
    expect((await h.api.deactivate(a.cookie, undefined)).body).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('needs_a_session_and_csrf', async () => {
    const h = harness();
    expect((await h.send(h.http.deactivate, h.request('/me/deactivate', { body: { password: PASSWORD } }))).status).toBe(401);
    const a = await h.signedIn();
    const noCsrf = h.request('/me/deactivate', { body: { password: PASSWORD }, cookie: a.cookie, headers: { 'x-requested-with': '' } });
    expect((await h.send(h.http.deactivate, noCsrf)).body).toMatchObject({ status: 403, code: 'CSRF_REJECTED' });
    expect(await statusOf(a.userId)).toBe('ACTIVE');
  });

  it('failures_are_rate_limited_per_user_even_for_the_right_password_afterwards', async () => {
    const h = harness();
    const a = await h.signedIn();
    const b = await h.signedIn();
    for (let i = 0; i < 5; i++) expect((await h.api.deactivate(a.cookie, 'wrong password nope')).status).toBe(401);
    const limited = await h.api.requestDeletion(a.cookie, PASSWORD); // shared budget across the sensitive routes
    expect(limited.body).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(await statusOf(a.userId)).toBe('ACTIVE');
    expect((await h.api.deactivate(b.cookie, 'wrong password nope')).status).toBe(401); // B has its own budget
  });
});

describe('POST /me/deactivate', () => {
  it('disables_the_account_revokes_every_session_and_blocks_login_with_the_generic_401', async () => {
    const h = harness();
    const a = await h.signedIn();
    const other = h.cookieOf((await h.api.login(a.email, PASSWORD)).headers); // a second device
    const res = await h.api.deactivate(a.cookie, PASSWORD);
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie().join(';')).toContain('Max-Age=0');
    expect(await statusOf(a.userId)).toBe('DISABLED');
    expect(await liveSessions(a.userId)).toBe(0);
    expect((await h.api.me(a.cookie)).status).toBe(401);
    expect((await h.api.me(other)).status).toBe(401);

    const denied = await h.api.login(a.email, PASSWORD);
    const unknown = await h.api.login(h.newEmail('nobody'), PASSWORD);
    expect(denied.body).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(shape(denied.body)).toEqual(shape(unknown.body));
  });

  it('audits_the_user_id_only', async () => {
    const h = harness();
    const a = await h.signedIn();
    await h.api.deactivate(a.cookie, PASSWORD);
    const ev = h.audit.events.find((e) => e.action === 'identity.account_deactivated');
    expect(ev).toEqual({ actorId: a.userId, action: 'identity.account_deactivated' });
    expect(JSON.stringify(h.audit.events)).not.toContain(a.email);
    expect(h.logs()).not.toContain(a.email);
    expect(h.logs()).not.toContain(PASSWORD);
  });
});

describe('deletion request', () => {
  it('returns_202_with_the_backup_statement_revokes_sessions_and_records_a_pending_row', async () => {
    const h = harness();
    const a = await h.signedIn();
    const res = await h.api.requestDeletion(a.cookie, PASSWORD);
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'pending', requestedAt: expect.any(String) });
    expect(res.body?.message).toMatch(/Backups are NOT purged immediately/);
    expect(res.headers.getSetCookie().join(';')).toContain('Max-Age=0');
    expect(await statusOf(a.userId)).toBe('DELETION_REQUESTED');
    expect(await liveSessions(a.userId)).toBe(0);
    const rows = await db.deletionRequest.findMany({ where: { userId: a.userId } });
    expect(rows).toEqual([expect.objectContaining({ status: 'PENDING', previousStatus: 'ACTIVE', cancelledAt: null, requestedAt: expect.any(Date) })]);
    expect((await h.api.me(a.cookie)).status).toBe(401);
    expect((await h.api.login(a.email, PASSWORD)).body).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(JSON.stringify(h.audit.events)).not.toContain(a.email);
  });

  it('is_idempotent_a_repeat_returns_the_same_pending_request', async () => {
    const h = harness();
    const a = await h.signedIn();
    const store = createPrismaIdentityStore(db);
    const owner = asOwnerId(a.userId);
    const first = await store.requestDeletion(owner, newId(), new Date());
    const again = await store.requestDeletion(owner, newId(), new Date(Date.now() + 60_000));
    expect(again).toEqual(first);
    expect(await db.deletionRequest.count({ where: { userId: a.userId } })).toBe(1);
  });

  it('two_concurrent_requests_leave_exactly_one_pending_row', async () => {
    const h = harness();
    const a = await h.signedIn();
    const res = await Promise.all([h.api.requestDeletion(a.cookie, PASSWORD), h.api.requestDeletion(a.cookie, PASSWORD)]);
    for (const r of res) expect([202, 401]).toContain(r.status);
    expect(res.some((r) => r.status === 202)).toBe(true);
    expect(await db.deletionRequest.count({ where: { userId: a.userId, status: 'PENDING' } })).toBe(1);
  });
});

describe('DELETE /me/deletion-request (cancel)', () => {
  it('restores_the_account_and_the_owner_can_sign_in_again', async () => {
    const h = harness();
    const a = await h.signedIn();
    await h.api.requestDeletion(a.cookie, PASSWORD);
    const res = await h.api.cancelDeletion(a.email, PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'cancelled' });
    expect(await statusOf(a.userId)).toBe('ACTIVE');
    expect(await db.deletionRequest.findMany({ where: { userId: a.userId } })).toEqual([
      expect.objectContaining({ status: 'CANCELLED', cancelledAt: expect.any(Date) }),
    ]);
    expect((await h.api.login(a.email, PASSWORD)).status).toBe(200);
    // a second cancel finds nothing pending
    expect((await h.api.cancelDeletion(a.email, PASSWORD)).body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('restores_the_remembered_previous_status', async () => {
    const h = harness();
    const a = await h.signedIn();
    await db.user.update({ where: { id: a.userId }, data: { status: 'DISABLED' } });
    const store = createPrismaIdentityStore(db);
    await store.requestDeletion(asOwnerId(a.userId), newId(), new Date());
    expect(await statusOf(a.userId)).toBe('DELETION_REQUESTED');
    expect((await h.api.cancelDeletion(a.email, PASSWORD)).status).toBe(200);
    expect(await statusOf(a.userId)).toBe('DISABLED');
  });

  it('wrong_credentials_are_the_same_generic_401_and_do_not_cancel', async () => {
    const h = harness();
    const a = await h.signedIn();
    await h.api.requestDeletion(a.cookie, PASSWORD);
    const wrong = await h.api.cancelDeletion(a.email, 'wrong password here');
    const unknown = await h.api.cancelDeletion(h.newEmail('ghost'), PASSWORD);
    expect(wrong.body).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(shape(wrong.body)).toEqual(shape(unknown.body));
    expect(await statusOf(a.userId)).toBe('DELETION_REQUESTED');
  });

  it('is_rate_limited_like_login', async () => {
    const h = harness();
    const a = await h.signedIn();
    await h.api.requestDeletion(a.cookie, PASSWORD);
    // the sign-in above used 1 of the 10 attempts of this address+email (shared with login)
    for (let i = 0; i < 9; i++) expect((await h.api.cancelDeletion(a.email, 'wrong password here')).status).toBe(401);
    expect((await h.api.cancelDeletion(a.email, PASSWORD)).body).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(await statusOf(a.userId)).toBe('DELETION_REQUESTED');
  });

  it('with_correct_credentials_but_nothing_pending_is_404', async () => {
    const h = harness();
    const a = await h.signedIn();
    expect((await h.api.cancelDeletion(a.email, PASSWORD)).body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('export requests', () => {
  it('records_a_pending_request_and_lists_only_the_callers_own', async () => {
    const h = harness();
    const a = await h.signedIn();
    const b = await h.signedIn();
    const created = await h.api.requestExport(a.cookie);
    expect(created.status).toBe(202);
    expect(created.body).toMatchObject({ id: expect.any(String), status: 'PENDING', requestedAt: expect.any(String) });
    await h.api.requestExport(b.cookie);

    const mine = await h.api.exports(a.cookie);
    expect(mine.body?.items).toEqual([created.body]);
    const theirs = (await h.api.exports(b.cookie)).body?.items as { id: string }[];
    expect(theirs).toHaveLength(1);
    expect(theirs[0]?.id).not.toBe((created.body as { id: string }).id);
    expect(JSON.stringify(mine.body)).not.toContain(a.userId);
    expect(await db.exportRequest.count({ where: { userId: a.userId } })).toBe(1);
  });

  it('paginates_with_a_cursor', async () => {
    const h = harness();
    const a = await h.signedIn();
    for (let i = 0; i < 3; i++) await h.api.requestExport(a.cookie);
    const p1 = await h.api.exports(a.cookie, '?limit=2');
    expect(p1.body?.items).toHaveLength(2);
    const p2 = await h.api.exports(a.cookie, `?limit=2&cursor=${p1.body?.nextCursor as string}`);
    expect(p2.body?.items).toHaveLength(1);
    expect(p2.body).not.toHaveProperty('nextCursor');
  });

  it('allows_three_per_day_per_user_then_429', async () => {
    const h = harness();
    const a = await h.signedIn();
    const b = await h.signedIn();
    for (let i = 0; i < 3; i++) expect((await h.api.requestExport(a.cookie)).status).toBe(202);
    const limited = await h.api.requestExport(a.cookie);
    expect(limited.body).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(await db.exportRequest.count({ where: { userId: a.userId } })).toBe(3);
    expect((await h.api.requestExport(b.cookie)).status).toBe(202);
  });

  it('needs_a_session', async () => {
    const h = harness();
    expect((await h.api.requestExport(undefined)).status).toBe(401);
    expect((await h.api.exports('a'.repeat(43))).status).toBe(401);
  });
});
