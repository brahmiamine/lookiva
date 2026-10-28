import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@/generated/prisma/client';

/** Prisma client on MariaDB. The caller owns `$disconnect()`. Does not read env. */
export function createDb(url: string): PrismaClient {
  const u = new URL(url);
  const adapter = new PrismaMariaDb({
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    // All times are UTC: the driver converts Dates as UTC and sets the session time_zone to +00:00.
    timezone: 'Z',
  });
  return new PrismaClient({ adapter });
}
