import { afterEach, describe, expect, it, vi } from 'vitest';

import { takeEarlyAuthStatus } from './earlyAuthStatus';

const URL_OK = `${window.location.origin}/api/auth/v2/get-session`;

const setEarly = (promise: Promise<Response>, startedAt = Date.now(), url = URL_OK) => {
  window.__gruenAuthStatus = { url, startedAt, promise };
};

describe('takeEarlyAuthStatus', () => {
  afterEach(() => {
    window.__gruenAuthStatus = null;
    vi.useRealTimers();
  });

  it('returns null when no early request was started', async () => {
    expect(await takeEarlyAuthStatus(URL_OK)).toBeNull();
  });

  it('returns the early response once for a matching GET', async () => {
    const res = new Response('{"user":null}');
    setEarly(Promise.resolve(res));
    expect(await takeEarlyAuthStatus(URL_OK, { method: 'GET' })).toBe(res);
    expect(await takeEarlyAuthStatus(URL_OK)).toBeNull();
  });

  it('ignores a different URL and keeps the early request', async () => {
    setEarly(Promise.resolve(new Response('{}')));
    expect(await takeEarlyAuthStatus(`${window.location.origin}/api/other`)).toBeNull();
    expect(window.__gruenAuthStatus).not.toBeNull();
  });

  it('ignores non-GET requests', async () => {
    setEarly(Promise.resolve(new Response('{}')));
    expect(await takeEarlyAuthStatus(URL_OK, { method: 'POST' })).toBeNull();
  });

  it('falls back (null) when the early fetch rejected', async () => {
    const p = Promise.reject(new Error('network'));
    p.catch(() => {});
    setEarly(p);
    expect(await takeEarlyAuthStatus(URL_OK)).toBeNull();
  });

  it('falls back when the early answer is older than 30 s', async () => {
    setEarly(Promise.resolve(new Response('{}')), Date.now() - 31_000);
    expect(await takeEarlyAuthStatus(URL_OK)).toBeNull();
  });
});
