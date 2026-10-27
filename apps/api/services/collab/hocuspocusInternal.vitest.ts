/**
 * `closeCollabRooms` runs after a permission write has landed and is called
 * without `await`: it must never reject (that would be an unhandled rejection
 * next to a request that already succeeded) and must stay silent when the
 * internal API is not configured.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

async function load(token: string) {
  vi.resetModules();
  vi.stubEnv('HOCUSPOCUS_INTERNAL_TOKEN', token);
  vi.stubEnv('HOCUSPOCUS_INTERNAL_URL', 'http://hocuspocus.test:1241');
  return import('./hocuspocusInternal.js');
}

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ ok: true, closed: 1 })));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('closeCollabRooms', () => {
  it('posts the rooms and the user to the internal close endpoint', async () => {
    const { closeCollabRooms } = await load('secret');

    await closeCollabRooms(['doc-1', 'chat-t1'], 'user-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://hocuspocus.test:1241/internal/rooms/close');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-internal-token']).toBe('secret');
    expect(JSON.parse(init.body as string)).toEqual({
      rooms: ['doc-1', 'chat-t1'],
      userId: 'user-1',
    });
  });

  it('closes for everyone when no user is given', async () => {
    const { closeCollabRooms } = await load('secret');

    await closeCollabRooms(['doc-1']);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ rooms: ['doc-1'], userId: null });
  });

  it('does nothing without a token or without rooms', async () => {
    const off = await load('');
    await off.closeCollabRooms(['doc-1']);

    const on = await load('secret');
    await on.closeCollabRooms([]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves when Hocuspocus is unreachable', async () => {
    const { closeCollabRooms } = await load('secret');
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(closeCollabRooms(['doc-1'])).resolves.toBeUndefined();
  });

  it('resolves when Hocuspocus answers with an error', async () => {
    const { closeCollabRooms } = await load('secret');
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));

    await expect(closeCollabRooms(['doc-1'])).resolves.toBeUndefined();
  });
});
