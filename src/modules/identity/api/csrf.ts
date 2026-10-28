import { AppError } from '@/platform/http/errors';
import { requestOrigin } from '@/platform/http/client';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF guard for state-changing requests: `X-Requested-With: lookiva` is required (a cross-site form cannot set it
 * and a cross-site fetch with it needs a CORS preflight we never grant), and an `Origin` header, when present,
 * must equal the request origin (APP_ORIGIN, else Host + scheme; see requestOrigin). 403 CSRF_REJECTED otherwise.
 */
export function assertCsrf(req: Request, cfg: { trustProxy: boolean; appOrigin?: string }): void {
  if (!UNSAFE.has(req.method)) return;
  const origin = req.headers.get('origin');
  if (req.headers.get('x-requested-with') !== 'lookiva' || (origin !== null && origin !== requestOrigin(req, cfg))) {
    throw new AppError('CSRF_REJECTED', 403, 'Cross-site request rejected');
  }
}
