export type AuditEvent = { actorId: string | null; action: string; target?: string };

export interface Audit {
  record(e: AuditEvent): Promise<void>;
}
