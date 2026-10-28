import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { LogAudit } from '@/platform/audit/log';
import { createLogger } from '@/platform/logger';

describe('LogAudit', () => {
  it('writes_each_event_as_one_info_line_under_audit', async () => {
    let out = '';
    const destination = new Writable({ write: (c, _e, cb) => ((out += c.toString()), cb()) });
    await new LogAudit(createLogger({ destination })).record({ actorId: 'u1', action: 'identity.login', target: 's1' });
    const line = JSON.parse(out.trim()) as { level: number; audit: unknown; msg: string };
    expect(line).toMatchObject({ level: 30, msg: 'audit', audit: { actorId: 'u1', action: 'identity.login', target: 's1' } });
  });
});
