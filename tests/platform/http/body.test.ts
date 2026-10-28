import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '@/platform/http/errors';
import { readJson } from '@/platform/http/body';

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
