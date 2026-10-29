import { NextResponse, type NextRequest } from 'next/server';
import { resolveLocale } from '@/i18n/routing';

export function proxy(request: NextRequest) {
  const { redirectTo } = resolveLocale(request.nextUrl.pathname);
  if (!redirectTo) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = redirectTo; // query string is kept by clone()
  return NextResponse.redirect(url, 307);
}

// Skip /api (segment boundary: `/apiary` is still localized), /_next, any path with a file extension (static and PWA
// assets: manifest.webmanifest, sw.js, favicon.ico, robots.txt...) and the extension-less metadata image routes.
export const config = {
  matcher: ['/((?!(?:api|icon|apple-icon|opengraph-image|twitter-image)(?:/|$)|_next/|.*\\..*).*)'],
};
