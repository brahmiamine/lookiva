import type { Audit, AuditEvent } from './port';

export class FakeAudit implements Audit {
  readonly events: AuditEvent[] = [];
  async record(e: AuditEvent): Promise<void> {
    this.events.push(e);
  }
}
