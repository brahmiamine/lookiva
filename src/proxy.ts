import { NextResponse, type NextRequest } from 'next/server';
import { resolveLocale } from '@/i18n/routing';

export function proxy(request: NextRequest) {
  const { redirectTo } = resolveLocale(request.nextUrl.pathname);
  if (!redirectTo) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = redirectTo; // query string is kept by clone()
  return NextResponse.redirect(url, 307);
}

// Skip /api, /_next and any path with a file extension (static assets).
export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };
