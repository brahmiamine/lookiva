import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { cruise, type IConfiguration } from 'dependency-cruiser';
import extractTsConfig from 'dependency-cruiser/config-utl/extract-ts-config';
import { describe, expect, it } from 'vitest';

const ruleSet = createRequire(import.meta.url)('../../.dependency-cruiser.cjs') as IConfiguration;

async function run(fixture: string) {
  const baseDir = fileURLToPath(new URL(`./fixtures/${fixture}/`, import.meta.url));
  // fixtures that use the `@/` alias carry their own tsconfig (paths)
  const tsConfigFile = `${baseDir}tsconfig.json`;
  const withAlias = existsSync(tsConfigFile);
  const tsConfig = withAlias ? extractTsConfig(tsConfigFile) : undefined;
  const { output } = await cruise(
    ['src'],
    {
      baseDir,
      ruleSet,
      validate: true,
      ...(withAlias ? { tsConfig: { fileName: tsConfigFile } } : {}),
    },
    { bustTheCache: true },
    { tsConfig },
  );
  if (typeof output === 'string') throw new Error('expected object output');
  const { summary } = output;
  return {
    rules: summary.violations.map((v) => v.rule.name),
    modules: output.modules,
    summary,
  };
}
const violatedRules = async (fixture: string) => (await run(fixture)).rules;

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
    const { rules, summary } = await run('allowed');
    expect(rules).toEqual([]);
    // not vacuous: files were cruised and the import was resolved
    expect(summary.totalCruised).toBeGreaterThan(0);
    expect(summary.totalDependenciesCruised).toBeGreaterThan(0);
  });

  it('forbids ui -> infrastructure', async () => {
    expect(await violatedRules('ui-infra')).toContain('ui-no-infra');
  });

  it('allows domain -> platform/kernel (relative import)', async () => {
    const { rules, summary } = await run('kernel-domain');
    expect(rules).toEqual([]);
    expect(summary.totalDependenciesCruised).toBeGreaterThan(0);
  });

  it('forbids domain -> platform outside the kernel', async () => {
    expect(await violatedRules('domain-platform')).toContain('domain-pure');
  });

  it('allows app -> module index and domain -> kernel through the @/ alias', async () => {
    const { rules, modules } = await run('alias-allowed');
    expect(rules).toEqual([]);
    const page = modules.find((m) => m.source === 'src/app/page.ts');
    expect(page?.dependencies.map((d) => d.resolved)).toEqual(['src/modules/a/index.ts']);
    const port = modules.find((m) => m.source === 'src/modules/a/domain/port.ts');
    expect(port?.dependencies.map((d) => d.resolved)).toEqual(['src/platform/kernel/index.ts']);
  });

  it('forbids app -> module internals (@/ alias)', async () => {
    expect(await violatedRules('alias-violations')).toContain('external-module-public-only');
  });

  it('forbids platform -> modules, even through the index (@/ alias)', async () => {
    const { summary } = await run('alias-violations');
    const v = summary.violations.filter((x) => x.rule.name === 'platform-no-modules');
    expect(v.map((x) => `${x.from} -> ${x.to}`)).toEqual(['src/platform/http/h.ts -> src/modules/a/index.ts']);
  });
});
