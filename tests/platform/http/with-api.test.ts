import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
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
});
