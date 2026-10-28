import pino from 'pino';

export type Logger = pino.Logger;

const KEYS = ['password', 'token', 'accessToken', 'refreshToken', 'cookie', 'authorization', 'emailBody'];

export const REDACT_PATHS: readonly string[] = [
  ...KEYS,
  ...KEYS.map((k) => `*.${k}`),
  'req.headers.authorization',
  'req.headers.cookie',
];

export function createLogger(opts: { level?: string; destination?: NodeJS.WritableStream } = {}): Logger {
  return pino(
    { level: opts.level ?? 'info', redact: { paths: [...REDACT_PATHS], censor: '[REDACTED]' } },
    opts.destination ?? process.stdout,
  );
}
