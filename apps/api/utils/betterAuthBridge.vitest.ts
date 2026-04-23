import { describe, expect, it } from 'vitest';

import { forwardBetterAuthCookies } from './betterAuthBridge.js';

function makeFakeRes() {
  const captured: Record<string, string[]> = {};
  return {
    captured,
    appendHeader(name: string, value: string) {
      const key = name.toLowerCase();
      (captured[key] ||= []).push(value);
    },
  };
}

describe('forwardBetterAuthCookies', () => {
  it('copies every Set-Cookie from a Better Auth Response onto the Express response', () => {
    const fakeRes = makeFakeRes();
    const headers = new Headers();
    headers.append('set-cookie', '__Secure-ba.state=abc; Domain=.example.com; HttpOnly; Secure; SameSite=Lax');
    headers.append('set-cookie', '__Secure-ba.pkce=def; HttpOnly; Secure');
    const response = new Response(null, { status: 200, headers });

    forwardBetterAuthCookies(fakeRes as unknown as import('express').Response, response);

    expect(fakeRes.captured['set-cookie']).toHaveLength(2);
    expect(fakeRes.captured['set-cookie'][0]).toContain('__Secure-ba.state=abc');
    expect(fakeRes.captured['set-cookie'][1]).toContain('__Secure-ba.pkce=def');
  });

  it('writes nothing when the Better Auth Response has no Set-Cookie headers', () => {
    const fakeRes = makeFakeRes();
    const response = new Response(null, { status: 200, headers: new Headers() });

    forwardBetterAuthCookies(fakeRes as unknown as import('express').Response, response);

    expect(fakeRes.captured['set-cookie']).toBeUndefined();
  });

  it('preserves the original cookie strings verbatim (no re-encoding of attributes)', () => {
    const fakeRes = makeFakeRes();
    const raw = '__Secure-ba.state=xyz; Max-Age=300; Domain=.gruenerator.eu; Path=/; SameSite=Lax; HttpOnly; Secure';
    const headers = new Headers();
    headers.append('set-cookie', raw);
    const response = new Response(null, { status: 200, headers });

    forwardBetterAuthCookies(fakeRes as unknown as import('express').Response, response);

    expect(fakeRes.captured['set-cookie']).toEqual([raw]);
  });
});
