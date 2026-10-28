import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

type Service = {
  ports?: { host_ip?: string; published?: string }[];
  healthcheck?: { test?: string[] };
};

// Needs the docker CLI only (no daemon): `config` just renders the merged files.
function config(...files: string[]): Record<string, Service> {
  const args = ['compose', '--env-file', '.env.example', ...files.flatMap((f) => ['-f', f]), 'config', '--format', 'json'];
  return (JSON.parse(execFileSync('docker', args, { encoding: 'utf8' })) as { services: Record<string, Service> }).services;
}

describe('local compose', () => {
  it('base_publishes_no_ports_for_db_and_redis', () => {
    const s = config('compose.yaml');
    expect(s.db?.ports ?? []).toEqual([]);
    expect(s.redis?.ports ?? []).toEqual([]);
  });

  it('test_override_binds_only_loopback', () => {
    const s = config('compose.yaml', 'compose.test.yaml');
    const ports = [...(s.db?.ports ?? []), ...(s.redis?.ports ?? [])];
    expect(ports.length).toBeGreaterThan(0);
    for (const p of ports) expect(p.host_ip).toBe('127.0.0.1');
  });

  it('db_and_redis_define_healthchecks', () => {
    const s = config('compose.yaml');
    expect(s.db?.healthcheck?.test?.length).toBeGreaterThan(0);
    expect(s.redis?.healthcheck?.test?.length).toBeGreaterThan(0);
    expect(s.worker?.healthcheck?.test?.length).toBeGreaterThan(0);
  });

  it('worker_publishes_no_ports', () => {
    expect(config('compose.yaml').worker?.ports ?? []).toEqual([]);
    expect(config('compose.yaml', 'compose.test.yaml').worker?.ports ?? []).toEqual([]);
  });
});
