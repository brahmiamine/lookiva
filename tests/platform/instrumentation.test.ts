import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const VALID = {
  DATABASE_URL: 'mysql://user:pass@localhost:3306/lookiva',
  REDIS_URL: 'redis://localhost:6379',
  READY_TOKEN: 'change-me',
  APP_ORIGIN: 'http://localhost:3000',
};

function stubEnv(vars: Record<string, string>) {
  for (const k of ['DATABASE_URL', 'REDIS_URL', 'READY_TOKEN', 'APP_ORIGIN']) vi.stubEnv(k, '');
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
}

// getEnv() memoises: reset modules so each test gets a fresh cache.
async function load() {
  vi.resetModules();
  return import('@/instrumentation');
}

beforeEach(() => {
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  vi.stubEnv('NEXT_PHASE', 'phase-production-server');
});
afterEach(() => vi.unstubAllEnvs());

describe('instrumentation register', () => {
  it('register_throws_EnvError_for_invalid_env_in_nodejs_runtime', async () => {
    stubEnv({ DATABASE_URL: 'not-a-url-s3cretvalue' });
    const { register } = await load();
    const { EnvError } = await import('@/platform/env');
    const err = await register().then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(EnvError);
    expect((err as Error).message).toContain('DATABASE_URL');
    expect((err as Error).message).not.toContain('s3cretvalue');
  });

  it('register_is_a_noop_during_production_build', async () => {
    stubEnv({});
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    const { register } = await load();
    await expect(register()).resolves.toBeUndefined();
  });

  it('register_is_a_noop_for_the_edge_runtime', async () => {
    stubEnv({});
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    const { register } = await load();
    await expect(register()).resolves.toBeUndefined();
  });

  it('register_passes_with_valid_env', async () => {
    stubEnv(VALID);
    const { register } = await load();
    await expect(register()).resolves.toBeUndefined();
  });

  // Next 16.4.3 only logs a failing register() and keeps serving 500s, so production must exit itself.
  it('register_exits_with_code_1_and_a_secret_free_message_in_production', async () => {
    stubEnv({ DATABASE_URL: 'not-a-url-s3cretvalue' });
    vi.stubEnv('NODE_ENV', 'production');
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')));
    const { register } = await load();
    await register().catch(() => undefined);
    expect(exit).toHaveBeenCalledWith(1);
    expect(errors.join('\n')).toContain('DATABASE_URL');
    expect(errors.join('\n')).not.toContain('s3cretvalue');
    vi.restoreAllMocks();
  });
});
