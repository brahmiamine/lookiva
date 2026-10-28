import { getEnv } from '@/platform/env';

/** Node-only half of instrumentation.ts (kept separate so the edge bundle never sees process.exit). */
export function validateEnvAtStartup(): void {
  try {
    getEnv();
  } catch (err) {
    // Next 16.4.3 only logs a failing register() and keeps answering every request with a bare 500: exit ourselves.
    if (process.env.NODE_ENV === 'production') {
      console.error(err instanceof Error ? err.message : 'Invalid environment');
      process.exit(1);
    }
    throw err;
  }
}
