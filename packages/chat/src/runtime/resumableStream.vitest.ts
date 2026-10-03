import { describe, it, expect, vi } from 'vitest';

import { parseSSEStream } from './GrueneratorModelAdapter/parseSSEStream';
import { abortEndsTurn, splitLiveTurn } from './resumableStream';

import type { GrueneratorAdapterCallbacks, StreamOutcome } from './GrueneratorModelAdapter/types';

const notifyWarning = vi.fn<(...args: unknown[]) => void>();
vi.mock('../lib/notify', () => ({
  notifyWarning: (...args: unknown[]) => {
    notifyWarning(...args);
  },
  notifyError: vi.fn(),
}));

function sseResponse(events: Array<{ event: string; data: unknown }>): Response {
  return new Response(
    events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
  );
}

const TURN = [
  { event: 'thread_created', data: { threadId: 't1' } },
  { event: 'stream_started', data: { streamId: 's-1' } },
  { event: 'text_delta', data: { text: 'Hallo ' } },
  { event: 'warning', data: { code: 'search_degraded', message: 'Quellen gestört' } },
  { event: 'text_delta', data: { text: 'Welt' } },
  { event: 'done', data: { threadId: 't1' } },
];

async function run(replay: boolean) {
  notifyWarning.mockClear();
  const callbacks: GrueneratorAdapterCallbacks = { onThreadCreated: vi.fn() };
  const outcome: StreamOutcome = { interrupted: false, indexedDocumentIds: [] };
  let last: unknown;
  for await (const r of parseSSEStream(
    sseResponse(TURN),
    callbacks,
    outcome,
    undefined,
    replay ? { effectsFrom: Infinity } : undefined
  )) {
    last = r;
  }
  return { last, outcome, callbacks };
}

describe('parseSSEStream replay', () => {
  it('rebuilds the same message as the live stream', async () => {
    const live = await run(false);
    const replayed = await run(true);
    expect((replayed.last as { content: unknown }).content).toEqual(
      (live.last as { content: unknown }).content
    );
    expect(replayed.outcome.completed).toBe(true);
  });

  it('records the stream id from stream_started', async () => {
    expect((await run(false)).outcome.streamId).toBe('s-1');
  });

  it('runs side effects live but not on a replay', async () => {
    const live = await run(false);
    expect(live.callbacks.onThreadCreated).toHaveBeenCalledWith('t1');
    expect(notifyWarning).toHaveBeenCalledWith('Quellen gestört');

    const replayed = await run(true);
    expect(replayed.callbacks.onThreadCreated).not.toHaveBeenCalled();
    expect(notifyWarning).not.toHaveBeenCalled();
  });
});

describe('splitLiveTurn', () => {
  const user = { id: 'u', role: 'user', content: 'Frage' };
  const live = { id: 'a', role: 'assistant', content: 'Halb', metadata: { live: true } };

  it('takes a trailing live assistant row out of the history', () => {
    expect(splitLiveTurn([user, live])).toEqual({
      rows: [user],
      live: { streamId: 'a', partialText: 'Halb' },
    });
  });

  it('leaves a live row alone when it is not the last one', () => {
    const rows = [user, live, { id: 'u2', role: 'user', content: 'Weiter' }];
    expect(splitLiveTurn(rows)).toEqual({ rows, live: null });
  });
});

describe('abortEndsTurn', () => {
  // assistant-ui's AbortError: `detach` tells a teardown from the stop button.
  const abortWith = (detach: boolean): AbortSignal => {
    const reason = Object.assign(new Error(), { name: 'AbortError', detach });
    return AbortSignal.abort(reason);
  };

  it('ends the turn on stop and on a superseded run, not when leaving the thread', () => {
    expect(abortEndsTurn(abortWith(false))).toBe(true);
    expect(abortEndsTurn(AbortSignal.abort())).toBe(true);
    expect(abortEndsTurn(abortWith(true))).toBe(false);
    expect(abortEndsTurn(new AbortController().signal)).toBe(false);
  });
});

describe('parseWithReattach', () => {
  /** A response whose body delivers `events`, then dies like a dropped connection. */
  function droppingResponse(events: Array<{ event: string; data: unknown }>): Response {
    const bytes = new TextEncoder().encode(
      events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
    );
    let sent = false;
    return new Response(
      new ReadableStream({
        // Bytes first, then the drop on the next read (an error in start()
        // would discard the queued bytes).
        pull(controller) {
          if (sent) controller.error(new TypeError('network error'));
          else controller.enqueue(bytes);
          sent = true;
        },
      })
    );
  }

  it('re-attaches after a drop and finishes the answer from the replay', async () => {
    vi.useFakeTimers();
    notifyWarning.mockClear();
    const fetch = vi.fn(async (url: string) => {
      expect(url).toBe('/api/chat-service/streams/s-1');
      return sseResponse(TURN);
    });
    const { useChatConfigStore } = await import('../stores/chatConfigStore');
    useChatConfigStore.setState({ fetch } as never);
    const { parseWithReattach } = await import('./GrueneratorModelAdapter/reattach');

    const onThreadCreated = vi.fn();
    const outcome: StreamOutcome = { interrupted: false, indexedDocumentIds: [] };
    const gen = parseWithReattach(
      droppingResponse(TURN.slice(0, 3)),
      { onThreadCreated },
      outcome,
      undefined,
      undefined
    );
    let last: unknown;
    const drained = (async () => {
      for (let r = await gen.next(); !r.done; r = await gen.next()) last = r.value;
    })();
    await vi.runAllTimersAsync();
    await drained;
    vi.useRealTimers();

    expect(fetch).toHaveBeenCalledTimes(1);
    const text = (last as { content: Array<{ type: string; text?: string }> }).content
      .filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('');
    expect(text).toBe('Hallo Welt');
    // thread_created ran once, live — not again on the replay. The warning
    // only arrived after the drop, so the replay is the first to show it.
    expect(onThreadCreated).toHaveBeenCalledTimes(1);
    expect(notifyWarning).toHaveBeenCalledTimes(1);
  });
});
