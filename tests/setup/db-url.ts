import { readFileSync } from 'node:fs';

/** DATABASE_URL for int tests: env first, else the placeholder URL from .env.example (127.0.0.1:3307). */
export function testDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const line = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8')
    .split('\n')
    .find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL missing from .env.example');
  return line.slice('DATABASE_URL='.length).trim();
}
