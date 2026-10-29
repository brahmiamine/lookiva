// Browser client for /api/v1. Adds the CSRF header every unsafe identity route requires, an Idempotency-Key on demand,
// and turns problem+json answers into ApiError. It never logs: request bodies can hold passwords.

export type FieldError = { path: string; message: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** Server `code` (INVALID_CREDENTIALS, RATE_LIMITED...), or HTTP_ERROR / NETWORK_ERROR when there is none. */
    readonly code: string,
    readonly errors: FieldError[] = [],
    /** From Retry-After (seconds) on 429/503. */
    readonly retryAfterSeconds?: number,
  ) {
    super(code); // never the server detail or body
    this.name = 'ApiError';
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Sends an Idempotency-Key; string keys can be reused across retries of one intent. */
  idempotent?: boolean | string;
  ifMatch?: string;
};

export async function api<T = unknown>(path: string, { method = 'GET', body, idempotent, ifMatch }: Options = {}) {
  const headers = new Headers({ 'X-Requested-With': 'lookiva', Accept: 'application/json' });
  // FormData keeps the browser's multipart Content-Type, including its boundary.
  const multipart = body instanceof FormData;
  if (body !== undefined && !multipart) headers.set('Content-Type', 'application/json');
  if (idempotent) headers.set('Idempotency-Key', typeof idempotent === 'string' ? idempotent : crypto.randomUUID());
  if (ifMatch) headers.set('If-Match', ifMatch);

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined || multipart ? (body as FormData | undefined) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR');
  }

  if (!res.ok) throw await apiErrorOf(res);
  const data = (res.status === 204 ? undefined : await res.json()) as T;
  return { data, headers: res.headers, status: res.status };
}

/** ApiError from a failed response (problem+json code and field errors when present). */
export async function apiErrorOf(res: Response): Promise<ApiError> {
  const retry = Number(res.headers.get('Retry-After'));
  const p = res.headers.get('Content-Type')?.includes('json') ? await res.json().catch(() => null) : null;
  const code = typeof p?.code === 'string' ? p.code : 'HTTP_ERROR';
  const errors = Array.isArray(p?.errors) ? (p.errors as FieldError[]) : [];
  return new ApiError(res.status, code, errors, Number.isFinite(retry) && retry > 0 ? retry : undefined);
}

/** Whole minutes to show for a Retry-After, at least 1. */
export const retryMinutes = (e: ApiError): number => Math.max(1, Math.ceil((e.retryAfterSeconds ?? 60) / 60));
