import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { cruise, type IConfiguration } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

const ruleSet = createRequire(import.meta.url)('../../.dependency-cruiser.cjs') as IConfiguration;

async function violatedRules(fixture: string): Promise<string[]> {
  const baseDir = fileURLToPath(new URL(`./fixtures/${fixture}/`, import.meta.url));
  const { output } = await cruise(['src'], { baseDir, ruleSet, validate: true });
  if (typeof output === 'string') throw new Error('expected object output');
  return output.summary.violations.map((v) => v.rule.name);
}

describe('module boundaries', () => {
  it('forbids domain -> infrastructure', async () => {
    expect(await violatedRules('domain-infra')).toContain('no-infra-from-inner');
  });

  it('forbids domain -> infrastructure also as impure domain', async () => {
    expect(await violatedRules('domain-infra')).toContain('domain-pure');
  });

  it('forbids a module importing another module internals', async () => {
    expect(await violatedRules('cross-module')).toContain('module-public-only');
  });

  it('allows a module importing another module through its index', async () => {
    expect(await violatedRules('allowed')).toEqual([]);
  });

  it('forbids ui -> infrastructure', async () => {
    expect(await violatedRules('ui-infra')).toContain('ui-no-infra');
  });
});
