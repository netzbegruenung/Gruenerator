import { describe, expect, it, vi } from 'vitest';

import { createChatApiClient } from './ChatContext';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createChatApiClient — 401 context', () => {
  it('hands the 401 body code to onUnauthorized', async () => {
    // The regression this guards: the chat stack used to call onUnauthorized()
    // with no arguments, so every teardown it triggered reported
    // `auth.401code: unknown` even though the code was on the wire.
    const onUnauthorized = vi.fn(() => false);
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        jsonResponse(401, {
          error: 'Authentication required',
          code: 'no_session_cookie',
          requestId: '9a6c840d',
        })
      )
    );

    const client = createChatApiClient(fetchFn, onUnauthorized);

    await expect(client.get('/api/agents/visibility')).rejects.toThrow();
    expect(onUnauthorized).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/agents/visibility',
        status: 401,
        code: 'no_session_cookie',
        requestId: '9a6c840d',
      })
    );
  });

  it('still reports a 401 that carries no JSON body, just without a code', async () => {
    const onUnauthorized = vi.fn(() => false);
    const fetchFn = vi.fn(() =>
      Promise.resolve(new Response('<html>Unauthorized</html>', { status: 401 }))
    );

    const client = createChatApiClient(fetchFn, onUnauthorized);

    await expect(client.get('/x')).rejects.toThrow();
    expect(onUnauthorized).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, code: undefined })
    );
  });

  it('replays the request once when the handler says the session is alive', async () => {
    const onUnauthorized = vi.fn(() => true);
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { code: 'session_not_found' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const client = createChatApiClient(fetchFn, onUnauthorized);

    await expect(client.get('/x')).resolves.toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
