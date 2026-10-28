import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env by itself; Node's built-in loader does it (no dotenv dependency).
try {
  process.loadEnvFile();
} catch {
  // no .env file: DATABASE_URL must come from the environment
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Placeholder only lets `prisma generate` run without a database; migrate needs the real URL.
  datasource: { url: process.env.DATABASE_URL ?? 'mysql://generate-only@127.0.0.1:3307/lookiva' },
});
