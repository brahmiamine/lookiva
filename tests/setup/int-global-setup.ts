import { execFileSync } from 'node:child_process';
import { testDatabaseUrl } from './db-url';

// Applies the versioned migrations to the (already running) MariaDB before int tests.
export default function setup(): void {
  const DATABASE_URL = testDatabaseUrl();
  process.env.DATABASE_URL = DATABASE_URL;
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL },
    stdio: 'inherit',
  });
}
