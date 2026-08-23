/**
 * The render queue, without a device.
 *
 * Everything interesting about this module is timing and bookkeeping —
 * serialisation, the retry, a reply that arrives after its request timed out,
 * a host that disappears mid-render. None of it needs a WebView, and all of it
 * is the kind of thing that only shows up on a phone at the worst moment.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetSharepicRenderForTests,
  __sharepicRenderState,
  handleRenderHostMessage,
  hostUnavailable,
  registerRenderHost,
  renderSharepic,
  unregisterRenderHost,
} from './sharepicRender';

const PROTOCOL_VERSION = 1;

/** Every message the page posted, in order. */
let posted: { type: string; requestId: string; canvasType: string }[] = [];

function connectHost({ ready = true }: { ready?: boolean } = {}): void {
  registerRenderHost((payload: string) => {
    posted.push(JSON.parse(payload) as (typeof posted)[number]);
  });
  if (ready) {
    handleRenderHostMessage({ type: 'RENDER_HOST_READY', protocolVersion: PROTOCOL_VERSION });
  }
}

function reply(requestId: string, image = 'data:image/png;base64,AAAA'): void {
  handleRenderHostMessage({ type: 'RENDER_RESULT', requestId, image });
}

beforeEach(() => {
  vi.useFakeTimers();
  posted = [];
  __resetSharepicRenderForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  __resetSharepicRenderForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('renderSharepic', () => {
  it('holds work until the page says it is ready', async () => {
    const pending = renderSharepic('a:v0', 'zitat', { headline: 'A' });
    connectHost({ ready: false });
    expect(posted).toHaveLength(0);

    handleRenderHostMessage({ type: 'RENDER_HOST_READY', protocolVersion: PROTOCOL_VERSION });
    expect(posted).toHaveLength(1);

    reply(posted[0]!.requestId);
    await expect(pending).resolves.toBe('data:image/png;base64,AAAA');
  });

  it('renders one at a time', async () => {
    connectHost();
    const first = renderSharepic('a:v0', 'zitat', {});
    const second = renderSharepic('b:v0', 'info', {});

    // A second Konva stage in the same page is how a phone-class WebView runs
    // out of memory, so the queue must not fan out.
    expect(posted).toHaveLength(1);
    expect(__sharepicRenderState().queued).toBe(1);

    reply(posted[0]!.requestId, 'first');
    await expect(first).resolves.toBe('first');
    expect(posted).toHaveLength(2);

    reply(posted[1]!.requestId, 'second');
    await expect(second).resolves.toBe('second');
  });

  it('shares one render between callers asking for the same picture', async () => {
    connectHost();
    const a = renderSharepic('same:v0', 'zitat', {});
    const b = renderSharepic('same:v0', 'zitat', {});

    expect(posted).toHaveLength(1);
    reply(posted[0]!.requestId, 'once');

    await expect(a).resolves.toBe('once');
    await expect(b).resolves.toBe('once');
  });

  it('retries once after a failure, then gives up', async () => {
    connectHost();
    const pending = renderSharepic('a:v0', 'zitat', {});

    handleRenderHostMessage({
      type: 'RENDER_ERROR',
      requestId: posted[0]!.requestId,
      reason: 'capture returned no image',
    });
    expect(posted).toHaveLength(2);

    handleRenderHostMessage({
      type: 'RENDER_ERROR',
      requestId: posted[1]!.requestId,
      reason: 'again',
    });
    // Two attempts is the budget: the failure this retry exists for is a cold
    // start, and a third try would only make the spinner longer.
    expect(posted).toHaveLength(2);
    await expect(pending).resolves.toBeNull();
  });

  it('treats a stalled render as a failure', async () => {
    connectHost();
    const pending = renderSharepic('a:v0', 'zitat', {});

    await vi.advanceTimersByTimeAsync(20_000);
    expect(posted).toHaveLength(2);

    reply(posted[1]!.requestId, 'late but fine');
    await expect(pending).resolves.toBe('late but fine');
  });

  it('ignores a reply to a request it already gave up on', async () => {
    connectHost();
    const pending = renderSharepic('a:v0', 'zitat', {});
    const firstId = posted[0]!.requestId;

    await vi.advanceTimersByTimeAsync(20_000);
    // The page finally answers the FIRST request while the retry is in flight.
    // Settling the job on it would hand back an image keyed to a request whose
    // props may already be stale.
    reply(firstId, 'stale');
    expect(__sharepicRenderState().inFlight).toBe('a:v0');

    reply(posted[1]!.requestId, 'fresh');
    await expect(pending).resolves.toBe('fresh');
  });

  it('puts an interrupted render back when the host goes away', async () => {
    connectHost();
    const pending = renderSharepic('a:v0', 'zitat', {});
    expect(posted).toHaveLength(1);

    unregisterRenderHost();
    expect(__sharepicRenderState()).toMatchObject({ queued: 1, inFlight: null, hostReady: false });

    posted = [];
    connectHost();
    expect(posted).toHaveLength(1);
    reply(posted[0]!.requestId, 'after reconnect');
    await expect(pending).resolves.toBe('after reconnect');
  });

  it('fails everything waiting when no renderer is reachable', async () => {
    const pending = renderSharepic('a:v0', 'zitat', {});
    // A spinner that never resolves is worse than an honest "keine Vorschau".
    hostUnavailable('handoff failed');
    await expect(pending).resolves.toBeNull();
    expect(__sharepicRenderState().demanded).toBe(false);
  });

  it('gives up when the host never comes up at all', async () => {
    const pending = renderSharepic('a:v0', 'zitat', {});
    await vi.advanceTimersByTimeAsync(45_000);
    await expect(pending).resolves.toBeNull();
  });

  it('declines to work against a page speaking another protocol version', async () => {
    // The WebView points at the deployed web app, so an old binary meeting a
    // newer page is a real state, not a hypothetical.
    const pending = renderSharepic('a:v0', 'zitat', {});
    connectHost({ ready: false });
    handleRenderHostMessage({ type: 'RENDER_HOST_READY', protocolVersion: PROTOCOL_VERSION + 1 });

    expect(posted).toHaveLength(0);
    await expect(pending).resolves.toBeNull();
  });

  it('reports a lost session so the host can re-mint its handoff', () => {
    connectHost();
    void renderSharepic('a:v0', 'zitat', {});
    expect(handleRenderHostMessage({ type: 'SESSION_LOST' })).toBe('session-lost');
    expect(__sharepicRenderState().queued).toBe(1);
  });

  it('ignores anything it cannot parse', () => {
    connectHost();
    expect(handleRenderHostMessage('garbage')).toBe('ignored');
    expect(handleRenderHostMessage({ type: 'NAVIGATE', url: 'https://evil.com' })).toBe('ignored');
  });
});

describe('host demand', () => {
  it('asks for a host only while there is work, and lets go afterwards', async () => {
    expect(__sharepicRenderState().demanded).toBe(false);

    connectHost();
    const pending = renderSharepic('a:v0', 'zitat', {});
    expect(__sharepicRenderState().demanded).toBe(true);

    reply(posted[0]!.requestId);
    await pending;

    // Still mounted right after: users scroll back to the sharepic they just
    // made, and re-booting the page costs seconds.
    expect(__sharepicRenderState().demanded).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(__sharepicRenderState().demanded).toBe(false);
  });
});
