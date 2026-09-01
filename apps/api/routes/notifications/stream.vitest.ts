/**
 * The notification SSE channel reports a refusal INSIDE the stream, because an
 * EventSource client cannot read status codes. Two refusals that must never
 * collapse into one: `unauthorized` (the client tears its session down) and
 * `unavailable` (auth backend down — the client must NOT). Both answer 200,
 * write nothing else, and subscribe to nothing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request, Response } from 'express';

const tryResolveUser = vi.fn();
vi.mock('../../middleware/authMiddleware.js', () => ({ tryResolveUser }));

const subscribeToUserNotifications = vi.fn();
vi.mock('../../services/notifications/index.js', () => ({ subscribeToUserNotifications }));

const { notificationStreamHandler } = await import('./stream.js');

interface FakeRes {
  writableEnded: boolean;
  destroyed: boolean;
  setHeader: ReturnType<typeof vi.fn>;
  flushHeaders: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
}

let res: FakeRes;
let closeHandler: (() => void) | null;

function makeReq(): Request {
  return {
    headers: {},
    on: (event: string, cb: () => void) => {
      if (event === 'close') closeHandler = cb;
    },
  } as unknown as Request;
}

const written = (): string => res.write.mock.calls.map((c) => String(c[0])).join('');

beforeEach(() => {
  vi.clearAllMocks();
  closeHandler = null;
  res = {
    writableEnded: false,
    destroyed: false,
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    flush: vi.fn(),
  };
  subscribeToUserNotifications.mockResolvedValue(vi.fn());
});

const run = () => notificationStreamHandler(makeReq(), res as unknown as Response);

describe('notification stream — refusals travel in the stream', () => {
  it('answers a session-less request with an `unauthorized` event, not a status code', async () => {
    tryResolveUser.mockResolvedValue({ kind: 'none', reason: 'no_cookie' });

    await run();

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(written()).toContain('event: unauthorized');
    // Empty data buffer = event never dispatched by the browser.
    expect(written()).toContain('data: {}');
    expect(res.end).toHaveBeenCalled();
    expect(subscribeToUserNotifications).not.toHaveBeenCalled();
  });

  it('raises the browser-side reconnect timer on a refusal', async () => {
    tryResolveUser.mockResolvedValue({ kind: 'none', reason: 'session_not_found' });

    await run();

    expect(written()).toMatch(/^retry: 300000\n/);
  });

  it('names an auth-backend outage `unavailable`, so the client keeps its session', async () => {
    tryResolveUser.mockResolvedValue({ kind: 'unavailable' });

    await run();

    expect(written()).toContain('event: unavailable');
    expect(written()).not.toContain('unauthorized');
    expect(res.end).toHaveBeenCalled();
    expect(subscribeToUserNotifications).not.toHaveBeenCalled();
  });

  it('streams for a resolved session and subscribes with that user id', async () => {
    tryResolveUser.mockResolvedValue({ kind: 'user', user: { id: 'user-1' } });

    await run();
    await Promise.resolve();

    expect(written()).toContain('event: connected');
    expect(written()).toContain('"userId":"user-1"');
    expect(subscribeToUserNotifications).toHaveBeenCalledWith('user-1', expect.any(Function));
    expect(res.end).not.toHaveBeenCalled();

    closeHandler?.();
  });
});
