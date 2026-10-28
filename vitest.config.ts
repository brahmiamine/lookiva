import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests only. Integration tests (*.int.test.ts) get their own config in a later task.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/**/*.int.test.ts', 'node_modules/**'],
  },
});
