import { createHash } from 'node:crypto';
import { clientIp } from '@/platform/http/client';
import type { Limit } from '@/platform/rate-limit';

const MIN = 60_000;
const HOUR = 60 * MIN;

export const LIMITS = {
  loginIpEmail: { name: 'login:ip-email', max: 10, windowMs: 15 * MIN },
  loginIp: { name: 'login:ip', max: 30, windowMs: 15 * MIN },
  registerIp: { name: 'register:ip', max: 5, windowMs: HOUR },
  // per address whatever the client IP: caps link/mail churn on one mailbox (and the re-registration race window)
  registerEmail: { name: 'register:email', max: 5, windowMs: HOUR },
  forgotIpEmail: { name: 'forgot:ip-email', max: 5, windowMs: HOUR },
  resendIpEmail: { name: 'resend:ip-email', max: 5, windowMs: HOUR },
  // verify and reset share one bucket: a guesser cannot double its attempts by alternating endpoints
  tokenIp: { name: 'token:ip', max: 10, windowMs: 15 * MIN },
  // re-authentication (password re-check on deactivate/deletion): per user, whatever the client address
  reauthUser: { name: 'reauth:user', max: 5, windowMs: 15 * MIN },
  exportUser: { name: 'export:user', max: 3, windowMs: 24 * HOUR },
  consentUser: { name: 'consent:user', max: 30, windowMs: MIN },
  geoCitiesUser: { name: 'geo-cities:user', max: 30, windowMs: MIN },
} as const satisfies Record<string, Limit>;

const emailHash = (normalizedEmail: string) => createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 32);

/** Bucket id for limits keyed on the mailbox alone (no client address). */
export const emailOnlyId = (normalizedEmail: string): string => `email:${emailHash(normalizedEmail)}`;

/** Bucket id: client address (see clientIp) plus, when given, a hash of the normalised email (no PII in Redis). */
export function rateLimitId(req: Request, trustProxy: boolean, normalizedEmail?: string): string {
  const ip = clientIp(req, trustProxy);
  if (normalizedEmail === undefined) return ip;
  return `${ip}:${emailHash(normalizedEmail)}`;
}
