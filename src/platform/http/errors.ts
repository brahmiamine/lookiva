import { STATUS_CODES } from 'node:http';
import { z, ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly errors?: { path: string; message: string }[],
    /** Extra response headers (e.g. Retry-After). Never put secrets here: they are sent to the client. */
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Uniform error body (RFC 9457 inspired). Also the OpenAPI source for error responses. */
export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string(),
  requestId: z.string(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ProblemJson = z.infer<typeof problemSchema>;

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return new AppError(
      'VALIDATION_ERROR',
      400,
      'Validation failed',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  // Never expose the original message or stack of an unexpected error.
  return new AppError('INTERNAL_ERROR', 500, 'Internal Server Error');
}

export function toProblem(err: unknown, requestId: string): ProblemJson {
  const e = toAppError(err);
  return {
    type: `urn:lookiva:problem:${e.code}`,
    title: STATUS_CODES[e.status] ?? 'Error',
    status: e.status,
    code: e.code,
    detail: e.message,
    requestId,
    ...(e.errors ? { errors: e.errors } : {}),
  };
}
