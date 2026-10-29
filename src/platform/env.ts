import { z } from 'zod';

const urlWithScheme = (...schemes: string[]) =>
  z.url().refine((v) => URL.canParse(v) && schemes.includes(new URL(v).protocol.slice(0, -1)), {
    message: `scheme must be ${schemes.join(' or ')}`,
  });

// A bare http(s) origin (no path, query or fragment), normalised to URL.origin.
const origin = z
  .url()
  .refine((v) => {
    if (!URL.canParse(v)) return false;
    const u = new URL(v);
    return (u.protocol === 'http:' || u.protocol === 'https:') && v.replace(/\/$/, '') === u.origin;
  }, { message: 'must be a bare http(s) origin' })
  .transform((v) => new URL(v).origin);

// An empty value (`APP_ORIGIN=` in a .env file) means "unset" for the optional variables.
const unsetIfEmpty = <T extends z.ZodType>(t: T) => z.preprocess((v) => (v === '' ? undefined : v), t);
const bool = (dflt: 'true' | 'false') =>
  unsetIfEmpty(z.enum(['true', 'false']).default(dflt).transform((v) => v === 'true'));

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: urlWithScheme('mysql', 'mariadb'),
    REDIS_URL: urlWithScheme('redis', 'rediss'),
    READY_TOKEN: z.string().min(1),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    // Only set to true behind exactly one reverse proxy that appends the peer address to X-Forwarded-For.
    TRUST_PROXY: bool('false'),
    // Production escape hatch: run without a trusted proxy, accepting that every client shares ONE rate-limit bucket.
    TRUST_PROXY_ACK_SINGLE_BUCKET: bool('false'),
    // outbox = dev/test adapter storing mails in the database; none = no transport (identity answers 503).
    EMAIL_TRANSPORT: unsetIfEmpty(z.enum(['outbox', 'none']).optional()),
    // The only base of links sent by email (never Host/X-Forwarded-*) and the expected Origin of the CSRF check.
    APP_ORIGIN: unsetIfEmpty(origin.optional()),
    // Private directory of the local object storage (photos). Outside public/, git-ignored (default ./.storage); mount a volume in production.
    STORAGE_LOCAL_DIR: unsetIfEmpty(z.string().min(1).optional()),
    // Per-user cap on stored photo bytes (default 1 GiB; owner decision pending).
    PHOTO_QUOTA_BYTES: unsetIfEmpty(z.coerce.number().int().positive().optional()),
  })
  .superRefine((env, ctx) => {
    const emailsPossible = (env.EMAIL_TRANSPORT ?? 'outbox') !== 'none';
    if (env.APP_ORIGIN === undefined && (emailsPossible || env.NODE_ENV === 'production')) {
      ctx.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'required in production and whenever emails can be sent' });
    }
    if (env.NODE_ENV !== 'production') return;
    if (!env.TRUST_PROXY && !env.TRUST_PROXY_ACK_SINGLE_BUCKET) {
      ctx.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY'],
        message: 'production needs TRUST_PROXY=true (or TRUST_PROXY_ACK_SINGLE_BUCKET=true to accept global rate limits)',
      });
    }
    if (env.READY_TOKEN.length < 32 || env.READY_TOKEN.toLowerCase().startsWith('change-me')) {
      ctx.addIssue({ code: 'custom', path: ['READY_TOKEN'], message: 'production needs a real token of 32+ characters' });
    }
    if (env.STORAGE_LOCAL_DIR === undefined) {
      ctx.addIssue({ code: 'custom', path: ['STORAGE_LOCAL_DIR'], message: 'production needs an explicit absolute directory on a mounted volume shared by web and worker' });
    }
    if (env.EMAIL_TRANSPORT === undefined || env.EMAIL_TRANSPORT === 'outbox') {
      ctx.addIssue({ code: 'custom', path: ['EMAIL_TRANSPORT'], message: 'production needs an explicit transport (outbox is dev-only)' });
    }
  })
  .transform((env) => ({ ...env, EMAIL_TRANSPORT: env.EMAIL_TRANSPORT ?? 'outbox', STORAGE_LOCAL_DIR: env.STORAGE_LOCAL_DIR ?? '.storage', PHOTO_QUOTA_BYTES: env.PHOTO_QUOTA_BYTES ?? 1024 ** 3 }));

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvError';
  }
}

/** Validates raw env. Error messages name variables and issue codes only, never values. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const problems = result.error.issues.map((i) => `${i.path.join('.')} (${i.code})`);
  throw new EnvError(`Invalid environment: ${problems.join(', ')}`);
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
