import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '@/platform';
import { createDb } from '@/platform/db';
import { OutboxEmail, readOutbox } from '@/platform/email/outbox';
import { testDatabaseUrl } from '../setup/db-url';

const db = createDb(testDatabaseUrl());
afterAll(() => db.$disconnect());
afterEach(() => vi.unstubAllEnvs());

describe('outbox email transport (real mariadb)', () => {
  it('sent_messages_are_readable_in_order_for_their_recipient_only', async () => {
    const to = `outbox-${randomUUID()}@example.test`;
    const email = new OutboxEmail(db, new FakeClock());
    await email.send({ to, subject: 'one', text: 'first' });
    await email.send({ to, subject: 'two', text: 'second' });
    await email.send({ to: `other-${to}`, subject: 'x', text: 'y' });
    expect(await readOutbox(db, to)).toEqual([
      { to, subject: 'one', text: 'first' },
      { to, subject: 'two', text: 'second' },
    ]);
  });

  it('read_outbox_refuses_to_run_in_production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(readOutbox(db, 'a@example.test')).rejects.toThrow(/production/);
  });
});
