import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

type Service = {
  ports?: { host_ip?: string; published?: string }[];
  healthcheck?: { test?: string[] };
};

// Needs the docker CLI only (no daemon): `config` just renders the merged files.
function config(...files: string[]): Record<string, Service> {
  return render(files, []);
}

function render(files: string[], extra: string[]): Record<string, Service> {
  const args = ['compose', '--env-file', '.env.example', ...extra, ...files.flatMap((f) => ['-f', f]), 'config', '--format', 'json'];
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

  it('web_is_absent_without_the_app_profile', () => {
    expect(Object.keys(config('compose.yaml')).sort()).toEqual(['db', 'redis', 'worker']);
    expect(Object.keys(config('compose.yaml', 'compose.test.yaml')).sort()).toEqual(['db', 'redis', 'worker']);
  });

  it('only_web_publishes_ports_in_the_app_profile', () => {
    const s = render(['compose.yaml'], ['--profile', 'app']);
    expect(Object.keys(s).sort()).toEqual(['db', 'redis', 'web', 'worker']);
    for (const [name, svc] of Object.entries(s)) {
      if (name !== 'web') expect(svc.ports ?? []).toEqual([]);
    }
    const ports = s.web?.ports ?? [];
    expect(ports.length).toBe(1);
    expect(ports[0]?.host_ip).toBe('127.0.0.1');
  });

  it('web_defines_a_healthcheck_in_the_app_profile', () => {
    const s = render(['compose.yaml'], ['--profile', 'app']);
    expect(s.web?.healthcheck?.test?.length).toBeGreaterThan(0);
  });
});
