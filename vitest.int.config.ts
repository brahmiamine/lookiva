import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Integration tests: need `pnpm infra:up` (real Redis on 127.0.0.1:6380, MariaDB on 127.0.0.1:3307).
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    globalSetup: ['tests/setup/int-global-setup.ts'],
    include: ['tests/**/*.int.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
