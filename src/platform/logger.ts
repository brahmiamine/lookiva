import pino from 'pino';

export type Logger = pino.Logger;

const KEYS = ['password', 'token', 'accessToken', 'refreshToken', 'cookie', 'authorization', 'emailBody'];

// Wildcard redaction is single-level (`*.password` does not reach `a.b.password`) and does not look inside
// error objects: those go through the `err` serializer below (always log errors under the `err` key).
export const REDACT_PATHS: readonly string[] = [
  ...KEYS,
  ...KEYS.map((k) => `*.${k}`),
  'req.headers.authorization',
  'req.headers.cookie',
];

const MAX_MESSAGE = 200;
// Properties drivers/HTTP clients attach to errors and that can carry user data, queries or credentials.
const STRIPPED = new Set(['input', 'query', 'params', 'headers', 'body', 'request', 'config', 'message', 'stack', 'name', 'cause']);

const truncate = (s: string): string => (s.length > MAX_MESSAGE ? `${s.slice(0, MAX_MESSAGE - 1)}…` : s);

/**
 * Safe, bounded view of an error for logs. Prisma errors (messages embed query arguments) keep only
 * name/code/meta.target; AppError never logs its stack; JSON.parse SyntaxErrors (message quotes the body) are
 * reduced to "invalid json"; all other errors keep a truncated message and stack minus the raw message.
 */
export function serializeError(err: unknown): unknown {
  if (!(err instanceof Error)) return err;
  const raw = err as Error & Record<string, unknown>;
  const out: Record<string, unknown> = { type: err.name };

  if (err.name.startsWith('PrismaClient')) {
    out.message = 'database error';
    if (typeof raw.code === 'string') out.code = raw.code;
    const target = (raw.meta as { target?: unknown } | undefined)?.target;
    if (target !== undefined) out.meta = { target };
    return out;
  }

  const isJsonSyntax = err instanceof SyntaxError && /JSON/.test(err.message);
  out.message = isJsonSyntax ? 'invalid json' : truncate(err.message);
  if (err.name !== 'AppError' && typeof err.stack === 'string') {
    // The first stack lines repeat the raw message: replace them with the safe header.
    const frames = err.stack.indexOf('\n    at ');
    out.stack = frames === -1 ? `${err.name}: ${out.message as string}` : `${err.name}: ${out.message as string}${err.stack.slice(frames)}`;
  }
  for (const [k, v] of Object.entries(raw)) {
    if (!STRIPPED.has(k)) out[k] = v;
  }
  if (raw.cause !== undefined) out.cause = serializeError(raw.cause);
  return out;
}

export function createLogger(opts: { level?: string; destination?: NodeJS.WritableStream } = {}): Logger {
  return pino(
    {
      level: opts.level ?? 'info',
      redact: { paths: [...REDACT_PATHS], censor: '[REDACTED]' },
      serializers: { err: serializeError },
    },
    opts.destination ?? process.stdout,
  );
}
