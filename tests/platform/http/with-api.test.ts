import { Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '@/platform/http/errors';
import { readJson } from '@/platform/http/body';
import { withApi } from '@/platform/http/with-api';
import { createLogger } from '@/platform/logger';

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

function memory() {
  let out = '';
  const destination = new Writable({
    write(chunk, _enc, cb) {
      out += chunk.toString();
      cb();
    },
  });
  return { logger: createLogger({ destination, level: 'debug' }), read: () => out };
}

const req = (headers: Record<string, string> = {}) => new Request('http://localhost/x', { headers });

// Headers cannot carry a newline, so hand the wrapper a minimal Request-like object.
const fakeReq = (id: string) => ({ headers: { get: (k: string) => (k.toLowerCase() === 'x-request-id' ? id : null) } }) as unknown as Request;

describe('withApi', () => {
  it('app_error_maps_to_problem_json', async () => {
    const { logger } = memory();
    const res = await withApi(async () => {
      throw new AppError('NOT_FOUND', 404, 'Garment not found');
    }, { logger })(req());
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const body = await res.json();
    expect(body).toMatchObject({
      type: 'urn:lookiva:problem:NOT_FOUND',
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Garment not found',
      requestId: res.headers.get('x-request-id'),
    });
    expect(body).not.toHaveProperty('errors');
  });

  it('unexpected_error_is_500_without_message_or_stack', async () => {
    const { logger, read } = memory();
    const res = await withApi(async () => {
      throw new Error('boom');
    }, { logger })(req());
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const text = await res.text();
    expect(text).not.toContain('boom');
    expect(text).not.toContain('at ');
    expect(JSON.parse(text)).toMatchObject({ code: 'INTERNAL_ERROR', detail: 'Internal Server Error', status: 500 });
    expect(read()).toContain('boom'); // logged for ops
  });

  it('app_error_500_is_logged_at_warn_without_stack', async () => {
    const { logger, read } = memory();
    await withApi(async () => {
      throw new AppError('NOT_READY', 503, 'Service not ready');
    }, { logger })(req());
    const line = JSON.parse(read().trim()) as { level: number; err: Record<string, unknown> };
    expect(line.level).toBe(40); // warn
    expect(line.err).toMatchObject({ type: 'AppError', code: 'NOT_READY' });
    expect(line.err).not.toHaveProperty('stack');
  });

  it('unexpected_error_is_logged_at_error', async () => {
    const { logger, read } = memory();
    await withApi(async () => {
      throw new Error('boom');
    }, { logger })(req());
    const line = JSON.parse(read().trim()) as { level: number; err: Record<string, unknown> };
    expect(line.level).toBe(50); // error
    expect(line.err.stack).toEqual(expect.any(String));
  });

  it('zod_error_is_400_with_errors_array', async () => {
    const { logger } = memory();
    const res = await withApi(async () => {
      z.object({ a: z.object({ b: z.string() }) }).parse({ a: { b: 1 } });
      return new Response('ok');
    }, { logger })(req());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.errors).toEqual([{ path: 'a.b', message: expect.any(String) }]);
  });

  it('inbound_request_id_with_newline_or_500_chars_is_replaced', async () => {
    for (const bad of ['abcdefgh\nINJECTED', 'a'.repeat(500)]) {
      const { logger, read } = memory();
      const res = await withApi(async (_r, ctx) => {
        ctx.log.info('hello');
        return new Response('ok');
      }, { logger })(fakeReq(bad));
      const id = res.headers.get('x-request-id') ?? '';
      expect(id).toMatch(ID_RE);
      expect(id).not.toBe(bad);
      expect(read()).not.toContain(bad);
      expect(read()).not.toContain('INJECTED');
      expect(read()).toContain(id);
    }
  });

  it('valid_inbound_request_id_is_echoed', async () => {
    const { logger } = memory();
    const res = await withApi(async () => new Response('ok'), { logger })(req({ 'x-request-id': 'abc-12345678' }));
    expect(res.headers.get('x-request-id')).toBe('abc-12345678');
  });

  it('malformed_json_body_never_reaches_logs', async () => {
    const { logger, read } = memory();
    const res = await withApi(async (r) => {
      await readJson(r, z.object({ password: z.string() }));
      return new Response('ok');
    }, { logger })(new Request('http://localhost/x', { method: 'POST', body: '{"password":hunter2}' }));
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ code: 'INVALID_JSON' });
    expect(text).not.toContain('hunter2');
    expect(read()).not.toContain('hunter2');
  });

  describe('with an invalid environment', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it('bad_env_still_yields_problem_json_500_with_request_id', async () => {
      const secrets = ['not-a-url-s3cretdb', 'not-a-url-s3cretredis'];
      vi.stubEnv('DATABASE_URL', secrets[0] as string);
      vi.stubEnv('REDIS_URL', secrets[1] as string);
      vi.stubEnv('READY_TOKEN', '');
      let logged = '';
      vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
        logged += chunk.toString();
        return true;
      }) as typeof process.stdout.write);
      vi.resetModules(); // fresh memoised getEnv + default logger
      const { withApi: freshWithApi } = await import('@/platform/http/with-api');
      const res = await freshWithApi(async () => {
        const { getEnv } = await import('@/platform/env'); // handler that itself needs env, like /ready
        getEnv();
        return new Response('ok');
      })(req());
      expect(res.status).toBe(500);
      expect(res.headers.get('content-type')).toContain('application/problem+json');
      expect(res.headers.get('x-request-id') ?? '').toMatch(ID_RE);
      const text = await res.text();
      expect(JSON.parse(text)).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
      for (const v of secrets) {
        expect(text).not.toContain(v);
        expect(logged).not.toContain(v);
      }
    });
  });
});
