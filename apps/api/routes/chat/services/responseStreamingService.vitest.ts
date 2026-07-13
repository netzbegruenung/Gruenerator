import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockStreamText = vi.fn();
vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
}));

const mockResolveModelTuple = vi.fn();
vi.mock('../agents/providers.js', () => ({
  getModel: (provider: string, model: string) => ({ provider, model }),
  resolveModelTuple: (...args: unknown[]) => mockResolveModelTuple(...args),
  VISION_MODEL: { provider: 'mistral', model: 'pixtral-large-latest' },
  isVisionCapable: () => true,
}));

vi.mock('../../../services/ai/modelDiscovery.js', () => ({
  isReasoningCapable: () => false,
}));

const mockStreamWithReasoning = vi.fn();
vi.mock('../../../services/ai/regoloReasoningStream.js', () => ({
  isReasoningStreamModel: (provider: string, model: string) =>
    (provider === 'regolo' && (model.startsWith('qwen') || model === 'gemma4-31b')) ||
    (provider === 'litellm' && (model === 'verdigado-think' || model === 'verdigado-pro')),
  streamWithReasoning: (...args: unknown[]) => mockStreamWithReasoning(...args),
}));

vi.mock('./messageHelpers.js', () => ({
  sanitizeContentPartsForModel: (m: unknown) => m,
  stripEmptyAssistantMessages: (m: unknown) => m,
}));

vi.mock('./sseHelpers.js', () => ({
  PROGRESS_MESSAGES: { streamInterrupted: 'stream interrupted' },
}));

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { resolveModel, streamWithFallback, streamForResolution, getFirstTokenDeadlineMs } =
  await import('./responseStreamingService.js');

// ─── Helpers ────────────────────────────────────────────────────────────────

interface SentEvent {
  event: string;
  data: unknown;
}

function makeSse() {
  const events: SentEvent[] = [];
  let ended = false;
  return {
    events,
    send: (event: string, data: unknown) => {
      events.push({ event, data });
    },
    end: () => {
      ended = true;
    },
    isEnded: () => ended,
  };
}

type SseWriterArg = ReturnType<typeof makeSse>;

/** fullStream that emits the given parts, then completes. */
function streamOf(parts: Array<Record<string, unknown>>) {
  return {
    fullStream: (async function* () {
      for (const part of parts) yield part;
    })(),
  };
}

/** fullStream whose first part never arrives (hung upstream). */
function hungStream() {
  return {
    fullStream: (async function* () {
      await new Promise(() => {});
      yield { type: 'text-delta', text: 'unreachable' };
    })(),
  };
}

const MESSAGES = [{ role: 'user', content: 'Hallo' }];

function makeResolution(overrides: Record<string, unknown> = {}) {
  return {
    model: { provider: 'mistral', model: 'mistral-medium-2604' },
    provider: 'mistral',
    modelName: 'mistral-medium-2604',
    ...overrides,
  };
}

function runStream(resolution: ReturnType<typeof makeResolution>, sse: SseWriterArg) {
  return streamWithFallback({
    primary: resolution as Parameters<typeof streamWithFallback>[0]['primary'],
    buildStream: (r) =>
      streamForResolution({
        resolution: r,
        messages: MESSAGES,
        maxTokens: 1000,
        temperature: 0.7,
        sse: sse as never,
      }),
    sse: sse as never,
  });
}

function textDeltas(sse: SseWriterArg): string[] {
  return sse.events
    .filter((e) => e.event === 'text_delta')
    .map((e) => (e.data as { text: string }).text);
}

beforeEach(() => {
  mockStreamText.mockReset();
  mockResolveModelTuple.mockReset();
  mockStreamWithReasoning.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── getFirstTokenDeadlineMs ────────────────────────────────────────────────

describe('getFirstTokenDeadlineMs', () => {
  it('gives reasoning-stream models the longest deadline (but not so long a hang stalls the turn)', () => {
    // Cut 45s→20s: a hanging verdigado-think used to make the user wait 45s
    // before the sibling fallback even started (observed 86s turn).
    expect(getFirstTokenDeadlineMs('regolo', 'qwen3.5-122b')).toBe(20_000);
    expect(getFirstTokenDeadlineMs('regolo', 'gemma4-31b')).toBe(20_000);
    expect(getFirstTokenDeadlineMs('litellm', 'verdigado-think')).toBe(20_000);
    expect(getFirstTokenDeadlineMs('litellm', 'verdigado-pro')).toBe(20_000);
  });

  it('gives the non-reasoning litellm overflow lane queue headroom', () => {
    expect(getFirstTokenDeadlineMs('litellm', 'gemma')).toBe(30_000);
  });

  it('defaults to 20s', () => {
    expect(getFirstTokenDeadlineMs('mistral', 'mistral-medium-2604')).toBe(20_000);
  });
});

// ─── resolveModel ───────────────────────────────────────────────────────────

describe('resolveModel', () => {
  const agentConfig = { provider: 'mistral', model: 'mistral-medium-2604' };

  it('flags an unknown modelId and falls back to the agent default', async () => {
    mockResolveModelTuple.mockResolvedValue(null);
    const resolution = await resolveModel(agentConfig, 'no-such-model', 'req_test');
    expect(resolution.unknownModelId).toBe('no-such-model');
    expect(resolution.provider).toBe('mistral');
    expect(resolution.modelName).toBe('mistral-medium-2604');
  });

  it('uses the resolved tuple for a known modelId without flagging', async () => {
    mockResolveModelTuple.mockResolvedValue({ provider: 'regolo', model: 'gemma4-31b' });
    const resolution = await resolveModel(agentConfig, 'gemma-4', 'req_test');
    expect(resolution.unknownModelId).toBeUndefined();
    expect(resolution.provider).toBe('regolo');
    expect(resolution.modelName).toBe('gemma4-31b');
  });
});

// ─── streamWithFallback × streamForResolution ───────────────────────────────

describe('streamWithFallback', () => {
  it('happy path: accumulates text deltas and emits them in order', async () => {
    mockStreamText.mockReturnValue(
      streamOf([
        { type: 'text-delta', text: 'Hallo ' },
        { type: 'text-delta', text: 'Welt' },
      ])
    );
    const sse = makeSse();
    const result = await runStream(makeResolution(), sse);
    expect(result).toBe('Hallo Welt');
    expect(textDeltas(sse)).toEqual(['Hallo ', 'Welt']);
    expect(sse.events.some((e) => e.event === 'fallback')).toBe(false);
    expect(sse.isEnded()).toBe(false);
  });

  it('falls back to the sibling on first-token timeout', async () => {
    vi.useFakeTimers();
    mockStreamText
      .mockReturnValueOnce(hungStream())
      .mockReturnValueOnce(streamOf([{ type: 'text-delta', text: 'vom Sibling' }]));
    const sse = makeSse();
    const resultPromise = runStream(
      makeResolution({ sibling: { provider: 'mistral', model: 'mistral-medium-2604' } }),
      sse
    );
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await resultPromise;
    expect(result).toBe('vom Sibling');
    const fallback = sse.events.find((e) => e.event === 'fallback');
    expect(fallback).toBeDefined();
    expect((fallback!.data as { reason: string }).reason).toBe('first_token_timeout');
  });

  it('does not time out before the provider-specific deadline (litellm 30s)', async () => {
    vi.useFakeTimers();
    mockStreamText
      .mockReturnValueOnce(hungStream())
      .mockReturnValueOnce(streamOf([{ type: 'text-delta', text: 'fallback' }]));
    const sse = makeSse();
    const resultPromise = runStream(
      makeResolution({
        provider: 'litellm',
        modelName: 'gemma',
        sibling: { provider: 'mistral', model: 'mistral-medium-2604' },
      }),
      sse
    );
    await vi.advanceTimersByTimeAsync(25_000);
    expect(sse.events.some((e) => e.event === 'fallback')).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    await resultPromise;
    expect(sse.events.some((e) => e.event === 'fallback')).toBe(true);
  });

  it('falls back when the primary completes without any content', async () => {
    mockStreamText
      .mockReturnValueOnce(streamOf([]))
      .mockReturnValueOnce(streamOf([{ type: 'text-delta', text: 'Antwort' }]));
    const sse = makeSse();
    const result = await runStream(
      makeResolution({ sibling: { provider: 'mistral', model: 'mistral-medium-2604' } }),
      sse
    );
    expect(result).toBe('Antwort');
    const fallback = sse.events.find((e) => e.event === 'fallback');
    expect((fallback!.data as { reason: string }).reason).toBe('empty_completion');
  });

  it('ends the stream with an error when no sibling is configured', async () => {
    mockStreamText.mockReturnValueOnce(streamOf([]));
    const sse = makeSse();
    const result = await runStream(makeResolution(), sse);
    expect(result).toBeNull();
    expect(sse.events.some((e) => e.event === 'error')).toBe(true);
    expect(sse.isEnded()).toBe(true);
  });

  it('ends the stream with an error when the fallback also fails', async () => {
    mockStreamText.mockReturnValueOnce(streamOf([])).mockReturnValueOnce(streamOf([]));
    const sse = makeSse();
    const result = await runStream(
      makeResolution({ sibling: { provider: 'mistral', model: 'mistral-medium-2604' } }),
      sse
    );
    expect(result).toBeNull();
    expect(sse.events.some((e) => e.event === 'error')).toBe(true);
    expect(sse.isEnded()).toBe(true);
  });

  it('a reasoning delta keeps the model alive past the deadline', async () => {
    vi.useFakeTimers();
    mockStreamText.mockReturnValueOnce(
      streamOf([
        { type: 'reasoning-delta', text: 'denke nach…' },
        { type: 'text-delta', text: 'Antwort nach langem Denken' },
      ])
    );
    const sse = makeSse();
    const resultPromise = runStream(makeResolution(), sse);
    await vi.advanceTimersByTimeAsync(25_000);
    const result = await resultPromise;
    expect(result).toBe('Antwort nach langem Denken');
    expect(sse.events.some((e) => e.event === 'reasoning_delta')).toBe(true);
    expect(sse.events.some((e) => e.event === 'fallback')).toBe(false);
  });
});
