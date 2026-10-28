import { Redis } from 'ioredis';
import { LogAudit } from '@/platform/audit/log';
import { systemClock } from '@/platform/clock/system';
import { createDb } from '@/platform/db';
import { FakeGeocoder } from '@/platform/geocoder/fake';
import { OutboxEmail } from '@/platform/email/outbox';
import { getEnv } from '@/platform/env';
import { createLogger } from '@/platform/logger';
import { createIdentityHttp, type IdentityHttp, type SessionHandler } from './http';

// One instance per process (globalThis survives Next dev hot reloads, so connections are not multiplied).
const g = globalThis as typeof globalThis & { __lookivaIdentity?: IdentityHttp };

/** Process-wide identity API built from the environment on first use (never at import or build time). */
function identity(): IdentityHttp {
  if (g.__lookivaIdentity) return g.__lookivaIdentity;
  const env = getEnv();
  const logger = createLogger({ level: env.LOG_LEVEL });
  const db = createDb(env.DATABASE_URL);
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
  redis.on('error', (err) => logger.error({ err }, 'redis error (identity)'));
  return (g.__lookivaIdentity = createIdentityHttp({
    db,
    redis,
    clock: systemClock,
    audit: new LogAudit(logger),
    email: env.EMAIL_TRANSPORT === 'outbox' ? new OutboxEmail(db, systemClock) : null,
    // ponytail: fake only; the real provider is a phase 06 decision (runbook §10)
    geocoder: new FakeGeocoder(),
    logger,
    config: { production: env.NODE_ENV === 'production', trustProxy: env.TRUST_PROXY, appOrigin: env.APP_ORIGIN },
  }));
}

type Route = (req: Request) => Promise<Response>;
const lazy = (pick: (i: IdentityHttp) => Route): Route => (req) => pick(identity())(req);

/** Handlers for the thin route files under src/app/api/v1. */
export const identityRoutes = {
  register: lazy((i) => i.register),
  verifyEmail: lazy((i) => i.verifyEmail),
  resendVerification: lazy((i) => i.resendVerification),
  login: lazy((i) => i.login),
  logout: lazy((i) => i.logout),
  logoutAll: lazy((i) => i.logoutAll),
  forgotPassword: lazy((i) => i.forgotPassword),
  resetPassword: lazy((i) => i.resetPassword),
  deactivate: lazy((i) => i.deactivate),
  requestDeletion: lazy((i) => i.requestDeletion),
  cancelDeletion: lazy((i) => i.cancelDeletion),
  requestExport: lazy((i) => i.requestExport),
  listExportRequests: lazy((i) => i.listExportRequests),
  searchCities: lazy((i) => i.searchCities),
  me: lazy((i) => i.me),
  listSessions: lazy((i) => i.listSessions),
  revokeSession: (req: Request, id: string) => identity().revokeSession(req, id),
  getPreferences: lazy((i) => i.getPreferences),
  updatePreferences: lazy((i) => i.updatePreferences),
  completeOnboarding: lazy((i) => i.completeOnboarding),
};

/**
 * Guard for every private route of every module: CSRF on unsafe methods, then the session cookie is resolved on each
 * request (revoked/expired/unknown => 401) and the handler receives `{ requestId, log, userId: OwnerId, sessionId }`.
 */
export function withSession(handler: SessionHandler): Route {
  let wrapped: Route | undefined;
  return (req) => (wrapped ??= identity().withSession(handler))(req);
}
