/**
 * Tests for the SSEWriter turn-persistence text tap (WP-B).
 *
 * The tap must fire for `text_delta` and `completion` (with the right `kind`),
 * never for `reasoning_delta`, and — crucially — must fire BEFORE the
 * writable/ended/destroyed guard: after a client disconnect the server keeps
 * streaming to completion and the placeholder row must keep accumulating.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Response } from 'express';

// The 'error' event path mirrors to observability — stub it so importing the
// module never reaches Sentry (these tests never emit 'error' anyway).
vi.mock('../../../utils/observability/captureSseError.js', () => ({
  captureSseError: vi.fn(),
}));

const { SSEWriter } = await import('./sseHelpers.js');

interface FakeResponse {
  writableEnded: boolean;
  destroyed: boolean;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
}

function makeRes(): FakeResponse {
  return {
    writableEnded: false,
    destroyed: false,
    write: vi.fn(),
    end: vi.fn(),
    flush: vi.fn(),
  };
}

let res: FakeResponse;
let writer: InstanceType<typeof SSEWriter>;

beforeEach(() => {
  res = makeRes();
  writer = new SSEWriter(res as unknown as Response);
});

describe('SSEWriter text listener', () => {
  it('fires for text_delta with kind "delta"', () => {
    const listener = vi.fn();
    writer.setTextListener(listener);

    writer.send('text_delta', { text: 'hello' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('delta', 'hello');
    expect(res.write).toHaveBeenCalledTimes(1);
  });

  it('fires for completion with kind "completion" reading the text field', () => {
    const listener = vi.fn();
    writer.setTextListener(listener);

    writer.send('completion', { text: 'final answer', citations: [] });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('completion', 'final answer');
  });

  it('does NOT fire for reasoning_delta', () => {
    const listener = vi.fn();
    writer.setTextListener(listener);

    writer.send('reasoning_delta', { text: 'thinking...' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('still fires after a client disconnect (res.destroyed === true)', () => {
    const listener = vi.fn();
    writer.setTextListener(listener);
    res.destroyed = true;

    writer.send('text_delta', { text: 'streamed post-disconnect' });

    // Tap ran (accumulation continues) even though the socket write is skipped.
    expect(listener).toHaveBeenCalledWith('delta', 'streamed post-disconnect');
    expect(res.write).not.toHaveBeenCalled();
  });

  it('setTextListener(undefined) deregisters the tap', () => {
    const listener = vi.fn();
    writer.setTextListener(listener);
    writer.setTextListener(undefined);

    writer.send('text_delta', { text: 'x' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not fire a completion tap when the text field is absent', () => {
    const listener = vi.fn();
    writer.setTextListener(listener);

    // Notebook-style completion carries `answer`, not `text` — the ChatGraph tap
    // reads `text` and must not fire on a missing field.
    writer.send('completion', { answer: 'notebook answer', citations: [] });

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createNullSSE (#3221)', () => {
  it('schluckt Events, ohne zu werfen, und meldet end() über isEnded()', async () => {
    const { createNullSSE } = await import('./sseHelpers.js');
    const sse = createNullSSE();

    expect(sse.isEnded()).toBe(false);
    expect(() => {
      sse.send('text_delta', { text: 'hallo' });
      sse.sendRaw('thinking_step', { stepId: 's1' });
      sse.send('error', { error: 'x' });
    }).not.toThrow();

    sse.end();
    expect(sse.isEnded()).toBe(true);
    // Nach end() bleibt send ein No-op — derselbe Vertrag wie beim echten Writer.
    expect(() => sse.send('text_delta', { text: 'nachher' })).not.toThrow();
  });

  it('bedient den Text-Tap wie der echte Writer', async () => {
    const { createNullSSE } = await import('./sseHelpers.js');
    const sse = createNullSSE();
    const seen: Array<[string, string]> = [];
    sse.setTextListener((kind, text) => seen.push([kind, text]));

    sse.send('text_delta', { text: 'a' });
    sse.send('completion', { text: 'ab', citations: [] });

    expect(seen).toEqual([
      ['delta', 'a'],
      ['completion', 'ab'],
    ]);
  });
});
