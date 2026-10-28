import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { REDACT_PATHS, createLogger } from '@/platform/logger';

function memory() {
  let out = '';
  const destination = new Writable({
    write(chunk, _enc, cb) {
      out += chunk.toString();
      cb();
    },
  });
  return { destination, read: () => out };
}

describe('createLogger', () => {
  it('redacts_sensitive_values_and_binds_requestId', () => {
    const { destination, read } = memory();
    const logger = createLogger({ destination });
    logger.info(
      {
        password: 'p4ss',
        token: 'tok',
        headers: { authorization: 'Bearer abc', cookie: 'a=b' },
        emailBody: 'texte secret',
      },
      'sensitive',
    );
    const raw = read();
    // quoted: bare 'tok' would match the key name "token"
    for (const secret of ['p4ss', 'tok', 'Bearer abc', 'a=b', 'texte secret']) {
      expect(raw).not.toContain(JSON.stringify(secret));
    }
    expect(raw).toContain('[REDACTED]');
    const line = JSON.parse(raw.trim()) as Record<string, unknown>;
    expect(line.password).toBe('[REDACTED]');
    expect(REDACT_PATHS).toContain('req.headers.authorization');

    const childOut = memory();
    createLogger({ destination: childOut.destination })
      .child({ requestId: 'r-1' })
      .info('hello');
    expect(childOut.read()).toContain('"requestId":"r-1"');
  });

  it('unknown_non_sensitive_fields_are_preserved', () => {
    const { destination, read } = memory();
    createLogger({ destination }).info({ userId: 'u1' }, 'ok');
    expect(JSON.parse(read().trim())).toMatchObject({ userId: 'u1', msg: 'ok' });
  });

  it('level_filters_debug_when_info', () => {
    const { destination, read } = memory();
    const logger = createLogger({ level: 'info', destination });
    logger.debug('hidden');
    logger.info('shown');
    expect(read()).not.toContain('hidden');
    expect(read()).toContain('shown');
  });
});
