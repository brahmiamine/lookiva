import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '@/platform/http/errors';
import { MAX_JSON_BYTES, readJson } from '@/platform/http/body';

const post = (body: string) => new Request('http://localhost/x', { method: 'POST', body });
const schema = z.object({ name: z.string() });

describe('readJson', () => {
  it('readJson_returns_the_parsed_value_for_a_valid_body', async () => {
    await expect(readJson(post('{"name":"jacket"}'), schema)).resolves.toEqual({ name: 'jacket' });
  });

  it('malformed_json_is_400_INVALID_JSON_without_the_parser_message', async () => {
    expect.assertions(6);
    try {
      await readJson(post('{"password":hunter2}'), schema);
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.status).toBe(400);
      expect(err.code).toBe('INVALID_JSON');
      expect(err.message).toBe('Malformed JSON body');
      expect(JSON.stringify({ ...err, message: err.message, stack: err.stack })).not.toContain('hunter2');
      expect(err.cause).toBeUndefined();
    }
  });

  it('empty_body_is_400_INVALID_JSON', async () => {
    await expect(readJson(post(''), schema)).rejects.toMatchObject({ code: 'INVALID_JSON', status: 400 });
  });

  it('schema_violation_is_400_VALIDATION_ERROR', async () => {
    const { toAppError } = await import('@/platform/http/errors');
    const err = await readJson(post('{"name":1}'), schema).catch((e: unknown) => toAppError(e));
    expect(err).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
  });
});

describe('readJson size cap (16 KiB)', () => {
  const schema = z.object({ a: z.string() });
  const streamOf = (chunks: string[], pulled: { n: number }) =>
    new ReadableStream<Uint8Array>({
      pull(c) {
        const next = chunks[pulled.n++];
        if (next === undefined) c.close();
        else c.enqueue(new TextEncoder().encode(next));
      },
    }, { highWaterMark: 0 }); // pull only on read(), so `pulled` counts what readJson actually consumed
  const fake = (headers: Record<string, string>, body: ReadableStream<Uint8Array> | null) =>
    ({ headers: new Headers(headers), body, text: () => Promise.reject(new Error('text() must not be used')) }) as unknown as Request;

  it('content_length_over_the_cap_is_413_without_reading_the_body', async () => {
    const pulled = { n: 0 };
    const err = await readJson(fake({ 'content-length': String(MAX_JSON_BYTES + 1) }, streamOf(['{"a":"secret"}'], pulled)), schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
    expect(pulled.n).toBe(0);
    expect(JSON.stringify(err)).not.toContain('secret');
  });

  it('streamed_body_over_the_cap_is_413_even_without_content_length', async () => {
    const pulled = { n: 0 };
    const big = 'x'.repeat(10_000);
    const err = await readJson(fake({}, streamOf([`{"a":"${big}`, `${big}"}`, 'never read'], pulled)), schema).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
    expect(pulled.n).toBe(2); // stopped as soon as the cap was crossed
  });

  it('lying_small_content_length_does_not_bypass_the_stream_cap', async () => {
    const big = 'x'.repeat(MAX_JSON_BYTES);
    const err = await readJson(fake({ 'content-length': '10' }, streamOf([`{"a":"${big}"}`], { n: 0 })), schema).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 413 });
  });

  it('body_under_the_cap_and_multibyte_utf8_are_read_normally', async () => {
    const value = 'é😀'.repeat(100);
    const chunks = [`{"a":"${value.slice(0, 3)}`, `${value.slice(3)}"}`];
    await expect(readJson(fake({}, streamOf(chunks, { n: 0 })), schema)).resolves.toEqual({ a: value });
    await expect(readJson(new Request('http://x/', { method: 'POST', body: '{"a":"ok"}' }), schema)).resolves.toEqual({ a: 'ok' });
  });

  it('missing_body_is_400_INVALID_JSON', async () => {
    await expect(readJson(fake({}, null), schema)).rejects.toMatchObject({ status: 400, code: 'INVALID_JSON' });
  });
});
