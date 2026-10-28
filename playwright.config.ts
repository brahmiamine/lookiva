import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
// Placeholder values from .env.example (no real secrets). The dev gallery needs none of them, but env parsing may.
const example = parseEnv(readFileSync('.env.example', 'utf8'));
const env = {
  ...Object.fromEntries((['DATABASE_URL', 'REDIS_URL', 'READY_TOKEN', 'LOG_LEVEL'] as const).map((k) => [k, example[k] ?? ''])),
  APP_ORIGIN: `http://localhost:${PORT}`,
};

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } };

// Chromium only. The dev gallery 404s in production, so the suite runs against `next dev`.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'fr-desktop', metadata: { locale: 'fr' }, use: { ...desktop, locale: 'fr-FR' } },
    { name: 'en-desktop', metadata: { locale: 'en' }, use: { ...desktop, locale: 'en-US' } },
    { name: 'ar-desktop', metadata: { locale: 'ar' }, use: { ...desktop, locale: 'ar' } },
    {
      name: 'fr-mobile',
      metadata: { locale: 'fr' },
      use: { ...desktop, locale: 'fr-FR', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
    },
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
