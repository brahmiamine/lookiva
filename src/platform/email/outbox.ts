import type { PrismaClient } from '@/generated/prisma/client';
import type { Clock } from '../clock/port';
import { newId } from '../http/ids';
import type { Email, EmailMessage } from './port';

/** EMAIL_TRANSPORT=outbox: stores messages in `outbox_messages` instead of sending them (dev/test only). */
export class OutboxEmail implements Email {
  constructor(
    private readonly db: PrismaClient,
    private readonly clock: Clock,
  ) {}

  async send(msg: EmailMessage): Promise<void> {
    await this.db.outboxMessage.create({ data: { id: newId(), ...msg, createdAt: this.clock.now() } });
  }
}

/** Test/dev helper: messages sent to `to`, oldest first. Never exposed over HTTP; refuses to run in production. */
export async function readOutbox(db: PrismaClient, to: string): Promise<EmailMessage[]> {
  if (process.env.NODE_ENV === 'production') throw new Error('readOutbox is not available in production');
  const rows = await db.outboxMessage.findMany({ where: { to }, orderBy: { id: 'asc' } });
  return rows.map(({ to: t, subject, text }) => ({ to: t, subject, text }));
}
