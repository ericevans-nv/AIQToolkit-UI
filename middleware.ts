import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME, HTTP_PROXY_PATH } from './constants';

export default function middleware(req: NextRequest) {
  // Skip middleware for static files and auth routes
  if (
    req.nextUrl.pathname.startsWith('/_next/') ||
    req.nextUrl.pathname.startsWith(`${HTTP_PROXY_PATH}/auth/`) ||
    req.nextUrl.pathname.startsWith('/favicon.ico') ||
    req.nextUrl.pathname.startsWith('/public/')
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  // Check if session cookie exists
  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME);

  if (!sessionCookie) {
    const sessionId = crypto.randomUUID();

    // Set the session cookie
    response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     *
     * Note: API auth routes are filtered dynamically in the middleware
     * function to respect the HTTP_PROXY_PATH environment variable
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
