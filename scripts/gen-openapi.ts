import { readFileSync, writeFileSync } from 'node:fs';
import { buildOpenApi, openapiDiffers, renderOpenApi } from '@/openapi';

const file = new URL('../openapi.json', import.meta.url);
const doc = buildOpenApi();

if (process.argv.includes('--check')) {
  let committed = '';
  try {
    committed = readFileSync(file, 'utf8');
  } catch {
    // missing file counts as different
  }
  if (openapiDiffers(committed, doc)) {
    console.error('openapi.json is out of date with the Zod schemas. Run `pnpm openapi:gen` and commit the result.');
    process.exit(1);
  }
  console.log('openapi.json is up to date.');
} else {
  writeFileSync(file, renderOpenApi(doc));
  console.log('openapi.json written.');
}
