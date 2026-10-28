import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Runs the real scan binary with the repo config. Returns the exit code (1 = secret found, 2 = tool/config error).
function scan(file: string): number {
  try {
    execFileSync('pnpm', ['exec', 'secretlint', '--secretlintignore', '.secretlintignore', file], { stdio: 'pipe' });
    return 0;
  } catch (e) {
    return (e as { status: number }).status;
  }
}

describe('secret scan', () => {
  it('secret_scan_flags_an_aws_style_key', () => {
    // Built at runtime so the repo never contains the literal.
    const key = 'AKIA' + 'QYLPMN5HHHFPZAM2';
    const dir = mkdtempSync(join(tmpdir(), 'lookiva-scan-'));
    const file = join(dir, 'leak.env');
    writeFileSync(file, `AWS_ACCESS_KEY_ID=${key}\n`);
    expect(scan(file)).toBe(1);
  });

  it('secret_scan_accepts_env_example', () => {
    expect(scan('.env.example')).toBe(0);
  });
});
