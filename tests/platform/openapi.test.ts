import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildOpenApi, openapiDiffers } from '@/platform/openapi/build';

describe('openapi', () => {
  it('openapi_contains_health_and_ready', () => {
    const doc = buildOpenApi();
    expect(doc.openapi.startsWith('3.1')).toBe(true);
    expect(Object.keys(doc.paths ?? {})).toEqual(expect.arrayContaining(['/api/v1/health', '/api/v1/ready']));
    expect(doc.components?.securitySchemes).toHaveProperty('readyToken');
    const ready = doc.paths?.['/api/v1/ready']?.get;
    expect(ready?.responses?.['401']).toBeDefined();
    expect(JSON.stringify(ready?.responses?.['503'])).toContain('application/problem+json');
  });

  it('openapi_check_fails_when_committed_file_differs', () => {
    const doc = buildOpenApi();
    const committed = readFileSync(new URL('../../openapi.json', import.meta.url), 'utf8');
    expect(openapiDiffers(committed, doc)).toBe(false);
    expect(openapiDiffers(committed.replace('Lookiva API', 'Other API'), doc)).toBe(true);
    expect(openapiDiffers(committed + ' ', doc)).toBe(true);
    // The real script exits 0 on the committed file.
    execFileSync('pnpm', ['openapi:check'], { stdio: 'pipe' });
  }, 60_000);
});
