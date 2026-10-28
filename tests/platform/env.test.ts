import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from '@/platform/env';

const valid = {
  NODE_ENV: 'test',
  DATABASE_URL: 'mysql://user:pass@localhost:3306/lookiva',
  REDIS_URL: 'redis://localhost:6379',
  READY_TOKEN: 'change-me',
};

describe('parseEnv', () => {
  it('throws EnvError naming every missing variable', () => {
    expect(() => parseEnv({})).toThrow(EnvError);
    try {
      parseEnv({});
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('DATABASE_URL');
      expect(msg).toContain('REDIS_URL');
      expect(msg).toContain('READY_TOKEN');
    }
  });

  it('never leaks a provided value in the error message', () => {
    expect.assertions(2);
    try {
      parseEnv({ DATABASE_URL: 'mysql://u:s3cret@h/db' });
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      expect((e as Error).message).not.toContain('s3cret');
    }
  });

  it('never leaks the value of an invalid variable', () => {
    expect.assertions(2);
    try {
      parseEnv({ ...valid, DATABASE_URL: 'not-a-url-s3cret' });
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      expect((e as Error).message).not.toContain('s3cret');
    }
  });

  it('defaults LOG_LEVEL to info for a valid env', () => {
    expect(parseEnv(valid).LOG_LEVEL).toBe('info');
  });
});
