import { execFileSync } from 'node:child_process';

// Applies the versioned migrations to the e2e database (the .env.example URL, see playwright.config.ts) before the
// suite. Needs `pnpm infra:up` (MariaDB on 127.0.0.1:3307, Redis on 6380); fails loudly otherwise.
export default function globalSetup(): void {
  const DATABASE_URL = process.env.E2E_DATABASE_URL;
  if (!DATABASE_URL) throw new Error('E2E_DATABASE_URL is set by playwright.config.ts');
  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL }, stdio: 'inherit' });
  } catch {
    throw new Error('e2e: cannot apply migrations. Is the infra up? Run `pnpm infra:up` first (MariaDB 3307, Redis 6380).');
  }
}
