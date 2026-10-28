import type { Logger } from '../logger';
import type { Audit, AuditEvent } from './port';

/** Audit trail as structured log lines (`msg: "audit"`). Events carry ids only, never PII. */
export class LogAudit implements Audit {
  constructor(private readonly log: Logger) {}

  async record(e: AuditEvent): Promise<void> {
    this.log.info({ audit: e }, 'audit');
  }
}
