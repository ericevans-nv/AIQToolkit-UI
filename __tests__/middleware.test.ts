/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME } from '../constants';
import middleware from '../middleware';

describe('session middleware', () => {
  it('creates an HttpOnly random session cookie without exposing it in a header', () => {
    const response = middleware(new NextRequest('http://localhost/'));
    const sessionCookie = response.cookies.get(SESSION_COOKIE_NAME);
    const setCookie = response.headers.get('set-cookie');

    expect(sessionCookie?.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=lax');
    expect(setCookie).toContain('Path=/');
    expect(response.headers.has('x-session-id')).toBe(false);
  });

  it('does not rotate an existing session cookie or expose it in a header', () => {
    const request = new NextRequest('http://localhost/', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=existing-session` },
    });

    const response = middleware(request);

    expect(response.headers.has('set-cookie')).toBe(false);
    expect(response.headers.has('x-session-id')).toBe(false);
  });
});
