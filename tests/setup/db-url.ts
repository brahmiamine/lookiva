import { readFileSync } from 'node:fs';

const fromExample = (name: string): string => {
  const line = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} missing from .env.example`);
  return line.slice(name.length + 1).trim();
};

/** DATABASE_URL for int tests: env first, else the placeholder URL from .env.example (127.0.0.1:3307). */
export const testDatabaseUrl = (): string => process.env.DATABASE_URL || fromExample('DATABASE_URL');

/** REDIS_URL for int tests: env first, else the placeholder URL from .env.example (127.0.0.1:6380). */
export const testRedisUrl = (): string => process.env.REDIS_URL || fromExample('REDIS_URL');
