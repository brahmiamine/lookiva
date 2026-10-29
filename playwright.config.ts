import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
// Placeholder values from .env.example only (no real secrets). The suite needs MariaDB + Redis on the loopback ports
// of compose.test.yaml: run `pnpm infra:up` first (`pnpm verify` does it); e2e/global-setup.ts applies the migrations.
const example = parseEnv(readFileSync(new URL('.env.example', import.meta.url), 'utf8'));
const env = {
  ...Object.fromEntries((['DATABASE_URL', 'REDIS_URL', 'READY_TOKEN', 'LOG_LEVEL'] as const).map((k) => [k, example[k] ?? ''])),
  APP_ORIGIN: `http://localhost:${PORT}`,
  EMAIL_TRANSPORT: 'outbox',
  // Each test sends its own X-Forwarded-For (e2e/support.ts) so rate limits are per test, as behind one real proxy.
  TRUST_PROXY: 'true',
};
// Test workers read the outbox from the same database the server writes to (never a developer's .env).
process.env.E2E_DATABASE_URL = example.DATABASE_URL ?? '';

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } };
const mobile = { ...desktop, viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true };

// Chromium only, against `next dev` (the dev gallery 404s in production builds).
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'fr-desktop', metadata: { locale: 'fr' }, use: { ...desktop, locale: 'fr-FR' } },
    { name: 'en-desktop', metadata: { locale: 'en' }, use: { ...desktop, locale: 'en-US' } },
    { name: 'ar-desktop', metadata: { locale: 'ar' }, use: { ...desktop, locale: 'ar' } },
    { name: 'fr-mobile', metadata: { locale: 'fr', mobile: true }, use: { ...mobile, locale: 'fr-FR' } },
    { name: 'ar-mobile', metadata: { locale: 'ar', mobile: true }, use: { ...mobile, locale: 'ar' } },
  ],
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/fr/dev/ui`,
    env,
    reuseExistingServer: false,
    timeout: 180_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
