import { SESSION_ABSOLUTE_MS } from '../domain/policy';

export const SESSION_COOKIE = 'lookiva_session';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function readSessionCookie(req: Request): string | null {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return TOKEN_RE.test(value) ? value : null;
  }
  return null;
}

const attrs = (maxAge: number, production: boolean) =>
  `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${production ? '; Secure' : ''}`;

/** Max-Age is the absolute lifetime; the idle timeout is enforced server-side only. Secure in production only. */
export const sessionCookie = (token: string, production: boolean): string =>
  `${SESSION_COOKIE}=${token}; ${attrs(SESSION_ABSOLUTE_MS / 1000, production)}`;

export const clearSessionCookie = (production: boolean): string => `${SESSION_COOKIE}=; ${attrs(0, production)}`;
