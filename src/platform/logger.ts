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
const MAX_DEPTH = 3;
const MAX_INNER_ERRORS = 5;
// Properties drivers/HTTP clients attach to errors and that can carry user data, queries or credentials.
// Only primitive extras are copied anyway; this list also covers values that are handled separately.
const STRIPPED = new Set([
  'input', 'query', 'params', 'headers', 'body', 'request', 'config', 'sql', 'response', 'data', 'toJSON',
  'message', 'stack', 'name', 'cause', 'errors', 'type',
]);

const truncate = (s: string): string => (s.length > MAX_MESSAGE ? `${s.slice(0, MAX_MESSAGE - 1)}…` : s);

function serialize(err: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (!(err instanceof Error)) {
    // Never pass arbitrary values through: objects may hold queries, inputs or secrets.
    return err !== null && (typeof err === 'object' || typeof err === 'function')
      ? { type: 'NonError' }
      : { type: typeof err, message: truncate(String(err)) };
  }
  if (seen.has(err)) return { type: 'Circular' };
  if (depth > MAX_DEPTH) return { type: 'Truncated' };
  seen.add(err);
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
    const header = `${err.name}: ${out.message as string}`;
    out.stack = frames === -1 ? header : `${header}${err.stack.slice(frames)}`;
  }
  // Extras: primitives only (objects/functions are skipped), strings truncated.
  for (const [k, v] of Object.entries(raw)) {
    if (STRIPPED.has(k)) continue;
    if (typeof v === 'string') out[k] = truncate(v);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  if (Array.isArray(raw.errors)) {
    // AppError.errors is a controlled list of {path, message}; anything else (AggregateError...) is serialized.
    out.errors =
      err.name === 'AppError'
        ? raw.errors
        : raw.errors.slice(0, MAX_INNER_ERRORS).map((e) => serialize(e, depth + 1, seen));
  }
  if (raw.cause !== undefined) out.cause = serialize(raw.cause, depth + 1, seen);
  return out;
}

/**
 * Safe, bounded view of anything passed as `err` to the logger. Never throws.
 * Prisma errors (messages embed query arguments) keep only name/code/meta.target; AppError never logs its stack;
 * JSON.parse SyntaxErrors (message quotes the body) become "invalid json"; other errors keep a truncated message
 * and a stack with the raw message removed, plus primitive extra props. Non-Error values are never logged.
 */
export function serializeError(err: unknown): unknown {
  try {
    return serialize(err, 0, new WeakSet());
  } catch {
    return { type: 'SerializationFailed' };
  }
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
