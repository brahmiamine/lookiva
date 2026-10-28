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

describe('parseEnv phase 03 rules', () => {
  const prod = {
    ...valid,
    NODE_ENV: 'production',
    READY_TOKEN: 'x'.repeat(32),
    EMAIL_TRANSPORT: 'none',
  };
  const fails = (raw: Record<string, string | undefined>, name: string) => {
    expect(() => parseEnv(raw)).toThrow(EnvError);
    expect(() => parseEnv(raw)).toThrow(name);
  };

  it('database_url_must_be_mysql_or_mariadb', () => {
    fails({ ...valid, DATABASE_URL: 'postgres://u:p@h:5432/db' }, 'DATABASE_URL');
    fails({ ...valid, DATABASE_URL: 'https://h/db' }, 'DATABASE_URL');
    expect(parseEnv({ ...valid, DATABASE_URL: 'mariadb://u:p@h:3306/db' }).DATABASE_URL).toContain('mariadb://');
  });

  it('redis_url_must_be_redis_or_rediss', () => {
    fails({ ...valid, REDIS_URL: 'http://h:6379' }, 'REDIS_URL');
    expect(parseEnv({ ...valid, REDIS_URL: 'rediss://h:6380' }).REDIS_URL).toBe('rediss://h:6380');
  });

  it('dev_defaults_trust_proxy_false_and_email_outbox', () => {
    const env = parseEnv(valid);
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.EMAIL_TRANSPORT).toBe('outbox');
    expect(env.APP_ORIGIN).toBeUndefined();
  });

  it('trust_proxy_parses_true_and_rejects_garbage', () => {
    expect(parseEnv({ ...valid, TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
    expect(parseEnv({ ...valid, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
    fails({ ...valid, TRUST_PROXY: 'maybe' }, 'TRUST_PROXY');
  });

  it('app_origin_must_be_a_bare_http_origin', () => {
    expect(parseEnv({ ...valid, APP_ORIGIN: 'https://app.example.com' }).APP_ORIGIN).toBe('https://app.example.com');
    fails({ ...valid, APP_ORIGIN: 'https://app.example.com/path' }, 'APP_ORIGIN');
    fails({ ...valid, APP_ORIGIN: 'ftp://app.example.com' }, 'APP_ORIGIN');
    fails({ ...valid, APP_ORIGIN: 'not a url' }, 'APP_ORIGIN');
  });

  it('production_rejects_change_me_ready_token', () => {
    fails({ ...prod, READY_TOKEN: 'change-me' }, 'READY_TOKEN');
    fails({ ...prod, READY_TOKEN: `change-me${'x'.repeat(40)}` }, 'READY_TOKEN');
  });

  it('production_requires_ready_token_of_32_chars', () => {
    fails({ ...prod, READY_TOKEN: 'x'.repeat(31) }, 'READY_TOKEN');
    expect(parseEnv(prod).READY_TOKEN).toHaveLength(32);
  });

  it('production_requires_explicit_email_transport_and_refuses_outbox', () => {
    fails({ ...prod, EMAIL_TRANSPORT: undefined }, 'EMAIL_TRANSPORT');
    fails({ ...prod, EMAIL_TRANSPORT: 'outbox' }, 'EMAIL_TRANSPORT');
    expect(parseEnv(prod).EMAIL_TRANSPORT).toBe('none');
  });

  it('dev_accepts_change_me_ready_token', () => {
    expect(parseEnv({ ...valid, NODE_ENV: 'development' }).READY_TOKEN).toBe('change-me');
  });
});
