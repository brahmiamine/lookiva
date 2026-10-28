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

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: urlWithScheme('mysql', 'mariadb'),
    REDIS_URL: urlWithScheme('redis', 'rediss'),
    READY_TOKEN: z.string().min(1),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    // Only set to true behind exactly one reverse proxy that appends the peer address to X-Forwarded-For.
    TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    // outbox = dev/test adapter storing mails in the database; none = no transport (identity answers 503).
    EMAIL_TRANSPORT: z.enum(['outbox', 'none']).optional(),
    APP_ORIGIN: origin.optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.READY_TOKEN.length < 32 || env.READY_TOKEN.toLowerCase().startsWith('change-me')) {
      ctx.addIssue({ code: 'custom', path: ['READY_TOKEN'], message: 'production needs a real token of 32+ characters' });
    }
    if (env.EMAIL_TRANSPORT === undefined || env.EMAIL_TRANSPORT === 'outbox') {
      ctx.addIssue({ code: 'custom', path: ['EMAIL_TRANSPORT'], message: 'production needs an explicit transport (outbox is dev-only)' });
    }
  })
  .transform((env) => ({ ...env, EMAIL_TRANSPORT: env.EMAIL_TRANSPORT ?? 'outbox' }));

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
