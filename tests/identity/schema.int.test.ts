import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '@/platform/db';
import { newId } from '@/platform/http/ids';
import { testDatabaseUrl } from '../setup/db-url';

const db = createDb(testDatabaseUrl());
const now = new Date();
const user = (emailNormalized: string) =>
  db.user.create({ data: { id: newId(), email: emailNormalized, emailNormalized, createdAt: now } });

afterAll(() => db.$disconnect());

describe('identity schema (real mariadb)', () => {
  it('email_normalized_unique_index_rejects_exact_duplicates', async () => {
    const e = `dup-${randomUUID()}@example.test`;
    await user(e);
    await expect(user(e)).rejects.toMatchObject({ code: 'P2002' });
  });

  it('email_normalized_index_is_byte_exact_so_folding_is_the_application_job', async () => {
    const e = `case-${randomUUID()}@example.test`;
    await user(e);
    // nopad_bin: neither case nor a trailing space collapse two values (the app normalises before insert).
    await expect(user(e.toUpperCase())).resolves.toBeDefined();
    await expect(user(`${e} `)).resolves.toBeDefined();
  });

  it('deleting_a_user_cascades_to_every_owned_row', async () => {
    const u = await user(`cascade-${randomUUID()}@example.test`);
    const userId = u.id;
    await db.credential.create({ data: { userId, passwordHash: 'x', updatedAt: now } });
    await db.emailToken.create({
      data: { id: newId(), userId, purpose: 'VERIFY_EMAIL', tokenHash: randomUUID().replace(/-/g, '').padEnd(64, '0'), createdAt: now, expiresAt: now },
    });
    await db.sessionRegistry.create({
      data: { id: newId(), userId, tokenHash: randomUUID().replace(/-/g, '').padEnd(64, '1'), userAgent: 'ua', createdAt: now, lastSeenAt: now, expiresAt: now },
    });
    await db.userPreferences.create({ data: { userId } });
    await db.consentRecord.create({ data: { id: newId(), userId, kind: 'AI', granted: true, createdAt: now } });
    await db.user.delete({ where: { id: userId } });
    const counts = await Promise.all([
      db.credential.count({ where: { userId } }),
      db.emailToken.count({ where: { userId } }),
      db.sessionRegistry.count({ where: { userId } }),
      db.userPreferences.count({ where: { userId } }),
      db.consentRecord.count({ where: { userId } }),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0]);
  });

  it('tables_use_utf8mb4_nopad_bin', async () => {
    const rows = await db.$queryRaw<{ t: string; c: string }[]>`
      SELECT TABLE_NAME AS t, TABLE_COLLATION AS c FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN
      ('users','credentials','email_tokens','session_registry','user_preferences','consent_records','outbox_messages')`;
    expect(rows).toHaveLength(7);
    for (const r of rows) expect(r.c, r.t).toBe('utf8mb4_nopad_bin');
  });
});
