import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '@/generated/prisma/client';
import type { Audit } from '@/platform/audit/port';
import type { Clock } from '@/platform/clock/port';
import type { Email } from '@/platform/email/port';
import { readJson } from '@/platform/http/body';
import { requestOrigin } from '@/platform/http/client';
import { etagFor } from '@/platform/http/etag';
import { AppError } from '@/platform/http/errors';
import { withIdempotency } from '@/platform/http/idempotency';
import { canonicalJson, readIdempotencyKey, requestHash } from '@/platform/http/idempotency-key';
import { parsePage } from '@/platform/http/pagination';
import { withApi } from '@/platform/http/with-api';
import { asOwnerId, type OwnerId } from '@/platform/kernel';
import type { Logger } from '@/platform/logger';
import { createRateLimiter, type Limit } from '@/platform/rate-limit';
import { createIdentityService } from '../application/service';
import type { Preferences } from '../application/ports';
import { normalizeEmail } from '../domain/email';
import { createPrismaIdentityStore } from '../infrastructure/prisma-store';
import { scryptHasher, sessionTokens } from '../infrastructure/crypto';
import { clearSessionCookie, readSessionCookie, sessionCookie } from './cookie';
import { assertCsrf } from './csrf';
import { LIMITS, rateLimitId } from './limits';
import * as s from './schemas';

export type IdentityConfig = { production: boolean; trustProxy: boolean; appOrigin?: string };

export type IdentityHttpDeps = {
  db: PrismaClient;
  redis: Redis;
  clock: Clock;
  audit: Audit;
  /** null = EMAIL_TRANSPORT=none: every identity route answers 503 (fail fast, no half-created accounts). */
  email: Email | null;
  config: IdentityConfig;
  logger?: Logger;
  rateLimitPrefix?: string;
};

export type SessionContext = { requestId: string; log: Logger; userId: OwnerId; sessionId: string };
export type SessionHandler = (req: Request, ctx: SessionContext) => Promise<Response>;
type Handler = (req: Request) => Promise<Response>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Idempotency scope for anonymous requests: a hash of (purpose, identifier) in the 64-char user column. It is not a
 * real owner, hence the explicit asOwnerId. Passwords never enter the request hash (an unsalted hash of a password
 * in the database would be crackable): a retry with the same key and another password replays the first answer.
 */
const anonScope = (purpose: string, identifier: string): OwnerId =>
  asOwnerId(`anon:${createHash('sha256').update(`${purpose}\n${identifier}`).digest('hex').slice(0, 59)}`);

const preferencesResponse = (p: Preferences, status = 200) =>
  Response.json(p, { status, headers: { ETag: etagFor(p.version) } });

export function createIdentityHttp(deps: IdentityHttpDeps) {
  const { config, clock } = deps;
  const limiter = createRateLimiter(deps.redis, deps.rateLimitPrefix);
  const service = deps.email
    ? createIdentityService({
        store: createPrismaIdentityStore(deps.db),
        hasher: scryptHasher,
        tokens: sessionTokens,
        clock,
        audit: deps.audit,
        mailer: deps.email,
      })
    : null;
  const ready = () => {
    if (!service) throw new AppError('EMAIL_TRANSPORT_UNAVAILABLE', 503, 'Accounts are unavailable: no email transport is configured');
    return service;
  };
  const limit = (req: Request, l: Limit, email?: string) => limiter.consume(l, rateLimitId(req, config.trustProxy, email), clock.now());
  const origin = (req: Request) => requestOrigin(req, config);
  const opts = { logger: deps.logger };

  /** Public (cookie-less) routes: CSRF still applies, so a third-party page cannot log a victim into another account. */
  const publicRoute = (fn: (req: Request, svc: ReturnType<typeof ready>, log: Logger) => Promise<Response>): Handler =>
    withApi(async (req, ctx) => {
      const svc = ready();
      assertCsrf(req, config);
      return fn(req, svc, ctx.log);
    }, opts);

  const withSession = (handler: SessionHandler): Handler =>
    withApi(async (req, ctx) => {
      const svc = ready();
      assertCsrf(req, config);
      const token = readSessionCookie(req);
      if (!token) throw new AppError('UNAUTHENTICATED', 401, 'Authentication required');
      const { userId, sessionId } = await svc.authenticate(token);
      return handler(req, { ...ctx, userId, sessionId });
    }, opts);

  const idempotent = async (req: Request, scope: OwnerId, hashed: unknown, log: Logger, run: () => Promise<void>, status: number, body: { status: string }) => {
    const key = readIdempotencyKey(req);
    const r = await withIdempotency(
      deps.db,
      { userId: scope, key, requestHash: requestHash(req.method, new URL(req.url).pathname, canonicalJson(hashed)) },
      async () => {
        await run();
        return { status, body };
      },
      { onPersistError: (err) => log.error({ err }, 'idempotency result not persisted') },
    );
    return Response.json(r.body, { status: r.status });
  };

  const svcOf = () => ready();

  return {
    withSession,

    register: publicRoute(async (req, svc, log) => {
      await limit(req, LIMITS.registerIp);
      const body = await readJson(req, s.registerBody);
      const email = normalizeEmail(body.email);
      return idempotent(req, anonScope('register', email), { email, locale: body.locale }, log,
        () => svc.register({ ...body, origin: origin(req) }), 202, { status: 'accepted' });
    }),

    verifyEmail: publicRoute(async (req, svc) => {
      await limit(req, LIMITS.tokenIp);
      const { token } = await readJson(req, s.tokenBody);
      await svc.verifyEmail(token);
      return Response.json({ status: 'verified' });
    }),

    resendVerification: publicRoute(async (req, svc) => {
      const { email } = await readJson(req, s.emailBody);
      await limit(req, LIMITS.resendIpEmail, normalizeEmail(email));
      await svc.resendVerification({ email, origin: origin(req) });
      return Response.json({ status: 'accepted' }, { status: 202 });
    }),

    login: publicRoute(async (req, svc) => {
      const { email, password } = await readJson(req, s.loginBody);
      await limit(req, LIMITS.loginIp);
      await limit(req, LIMITS.loginIpEmail, normalizeEmail(email));
      const r = await svc.login({ email, password, userAgent: req.headers.get('user-agent') });
      return Response.json({ user: r.user }, { headers: { 'Set-Cookie': sessionCookie(r.token, config.production) } });
    }),

    logout: withSession(async (_req, ctx) => {
      await svcOf().logout(ctx.userId, ctx.sessionId);
      return new Response(null, { status: 204, headers: { 'Set-Cookie': clearSessionCookie(config.production) } });
    }),

    logoutAll: withSession(async (_req, ctx) => {
      await svcOf().logoutAll(ctx.userId);
      return new Response(null, { status: 204, headers: { 'Set-Cookie': clearSessionCookie(config.production) } });
    }),

    forgotPassword: publicRoute(async (req, svc, log) => {
      const body = await readJson(req, s.emailBody);
      const email = normalizeEmail(body.email);
      await limit(req, LIMITS.forgotIpEmail, email);
      return idempotent(req, anonScope('forgot', email), { email }, log,
        () => svc.forgotPassword({ email: body.email, origin: origin(req) }), 202, { status: 'accepted' });
    }),

    resetPassword: publicRoute(async (req, svc, log) => {
      await limit(req, LIMITS.tokenIp);
      const body = await readJson(req, s.resetBody);
      const tokenHash = sessionTokens.hash(body.token);
      return idempotent(req, anonScope('reset', tokenHash), { tokenHash }, log,
        () => svc.resetPassword(body), 200, { status: 'password_reset' });
    }),

    me: withSession(async (_req, ctx) => Response.json(await svcOf().getMe(ctx.userId))),

    listSessions: withSession(async (req, ctx) => {
      const page = parsePage(new URL(req.url).searchParams);
      return Response.json(await svcOf().listSessions(ctx.userId, ctx.sessionId, page));
    }),

    revokeSession: (req: Request, id: string) =>
      withSession(async (_req, ctx) => {
        if (!UUID_RE.test(id)) throw new AppError('NOT_FOUND', 404, 'Session not found');
        await svcOf().revokeSession(ctx.userId, id);
        const headers: HeadersInit = id === ctx.sessionId ? { 'Set-Cookie': clearSessionCookie(config.production) } : {};
        return new Response(null, { status: 204, headers });
      })(req),

    getPreferences: withSession(async (_req, ctx) => preferencesResponse(await svcOf().getPreferences(ctx.userId))),

    updatePreferences: withSession(async (req, ctx) => {
      const patch = await readJson(req, s.preferencesPatchBody);
      return preferencesResponse(await svcOf().updatePreferences(ctx.userId, req.headers.get('if-match'), patch));
    }),

    completeOnboarding: withSession(async (req, ctx) => {
      const body = await readJson(req, s.onboardingBody);
      return preferencesResponse(await svcOf().completeOnboarding(ctx.userId, body));
    }),
  };
}

export type IdentityHttp = ReturnType<typeof createIdentityHttp>;
