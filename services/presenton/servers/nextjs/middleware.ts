import { NextResponse } from 'next/server';

import type { NextRequest } from 'next/server';

/**
 * Next.js middleware — checks for Better Auth session cookie.
 * If no session cookie found, redirects to Grünerator login.
 *
 * The cookie prefix matches Better Auth's `advanced.cookiePrefix: 'ba'`
 * from the Grünerator API config. With `crossSubDomainCookies` enabled,
 * cookies set on gruenerator.eu are readable on slides.gruenerator.eu.
 */
export function middleware(request: NextRequest) {
  const cookiePrefix = process.env.BA_COOKIE_PREFIX || 'ba';
  const sessionCookie = request.cookies.get(`${cookiePrefix}.session_token`);

  if (sessionCookie) {
    return NextResponse.next();
  }

  // No session — redirect to Grünerator login
  const authUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://gruenerator.eu';
  const currentUrl = request.url;
  const loginUrl = `${authUrl}/login?redirectTo=${encodeURIComponent(currentUrl)}`;

  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Only protect presentation routes, not static assets
  matcher: ['/presentation/:path*', '/upload/:path*', '/custom-template/:path*'],
};
