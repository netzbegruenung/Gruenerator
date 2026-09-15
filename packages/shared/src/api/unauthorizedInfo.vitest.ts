import { describe, expect, it } from 'vitest';

import { unauthorizedInfoFromResponse } from './unauthorizedInfo.js';

function jsonResponse(body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status: 401,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('unauthorizedInfoFromResponse', () => {
  it('reads code and requestId out of the backend 401 body', async () => {
    const info = await unauthorizedInfoFromResponse(
      jsonResponse({
        error: 'Authentication required',
        code: 'no_session_cookie',
        requestId: '9a6c840d',
      }),
      '/api/agents/visibility'
    );

    expect(info).toEqual({
      url: '/api/agents/visibility',
      status: 401,
      code: 'no_session_cookie',
      requestId: '9a6c840d',
    });
  });

  it('falls back to the X-Request-Id header when the body omits it', async () => {
    const info = await unauthorizedInfoFromResponse(
      jsonResponse({ code: 'session_not_found' }, { 'X-Request-Id': 'abc12345' })
    );

    expect(info.code).toBe('session_not_found');
    expect(info.requestId).toBe('abc12345');
  });

  it('reports no code for a 401 that carries no JSON body', async () => {
    // Reverse proxy / HTML error page. Not a swallowed fault: the answer to
    // "does this response name a code?" is simply no.
    const info = await unauthorizedInfoFromResponse(
      new Response('<html>Unauthorized</html>', { status: 401 })
    );

    expect(info.code).toBeUndefined();
    expect(info.status).toBe(401);
  });

  it('ignores a non-string code rather than passing a number through as a tag', async () => {
    const info = await unauthorizedInfoFromResponse(jsonResponse({ code: 42 }));

    expect(info.code).toBeUndefined();
  });

  it('leaves the body readable for the caller', async () => {
    // Load-bearing: the helper clones. Without it the caller's own
    // `response.json()` would throw on an already-consumed stream.
    const response = jsonResponse({ code: 'no_session_cookie' });

    await unauthorizedInfoFromResponse(response);

    await expect(response.json()).resolves.toEqual({ code: 'no_session_cookie' });
  });
});
