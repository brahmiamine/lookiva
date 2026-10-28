import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { AppError } from '@/platform/http/errors';
import { REDACT_PATHS, createLogger, serializeError } from '@/platform/logger';

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

describe('error serializer', () => {
  const logErr = (err: unknown) => {
    const { destination, read } = memory();
    createLogger({ destination }).error({ err }, 'failed');
    return { raw: read(), line: JSON.parse(read().trim()) as { err: Record<string, unknown> } };
  };

  it('prisma_validation_error_does_not_log_query_arguments', () => {
    const err = new Prisma.PrismaClientValidationError(
      'Invalid `prisma.user.create()` invocation:\n{ data: { email: "a@b.c", password: "x" } }',
      { clientVersion: '7.10.1' },
    );
    const { raw, line } = logErr(err);
    expect(raw).not.toContain('a@b.c');
    expect(raw).not.toContain('password');
    expect(line.err).toEqual({ type: 'PrismaClientValidationError', message: 'database error' });
  });

  it('prisma_known_error_keeps_code_and_meta_target_only', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on a@b.c', {
      code: 'P2002',
      clientVersion: '7.10.1',
      meta: { target: ['email'], value: 'a@b.c' },
    });
    const { raw, line } = logErr(err);
    expect(raw).not.toContain('a@b.c');
    expect(line.err).toEqual({
      type: 'PrismaClientKnownRequestError',
      message: 'database error',
      code: 'P2002',
      meta: { target: ['email'] },
    });
  });

  it('error_input_and_query_properties_are_stripped', () => {
    const err = Object.assign(new Error('driver failed'), {
      code: 'ER_X',
      input: 'secret-input',
      query: 'SELECT secret-query',
      params: ['secret-param'],
      headers: { h: 'secret-header' },
      body: 'secret-body',
      request: { r: 'secret-request' },
      config: { c: 'secret-config' },
      harmless: 'kept',
    });
    const { raw, line } = logErr(err);
    expect(raw).not.toContain('secret-');
    expect(line.err).toMatchObject({ type: 'Error', message: 'driver failed', code: 'ER_X', harmless: 'kept' });
    expect(typeof line.err.stack).toBe('string');
  });

  it('message_is_truncated_to_200_chars', () => {
    const { line } = logErr(new Error('x'.repeat(500)));
    expect((line.err.message as string).length).toBeLessThanOrEqual(200);
    expect(JSON.stringify(line)).not.toContain('x'.repeat(201));
  });

  it('json_syntax_error_message_is_replaced', () => {
    let err: unknown;
    try {
      JSON.parse('{"password":hunter2}');
    } catch (e) {
      err = e;
    }
    const { raw, line } = logErr(err);
    expect(raw).not.toContain('hunter2');
    expect(line.err.message).toBe('invalid json');
  });

  it('app_error_is_logged_without_stack', () => {
    const e = serializeError(new AppError('NOT_READY', 503, 'Service not ready'));
    expect(e).toEqual({ type: 'AppError', message: 'Service not ready', code: 'NOT_READY', status: 503 });
  });
});
