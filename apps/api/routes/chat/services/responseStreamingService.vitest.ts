import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockStreamText = vi.fn();
vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  // `classifyProviderError` (providerErrors.js) asks the SDK first — without
  // this the upstream-error classification would crash on `undefined.isInstance`.
  APICallError: class APICallError extends Error {
    static isInstance(err: unknown): boolean {
      return err instanceof APICallError;
    }
    statusCode: number | undefined;
    isRetryable: boolean;
    constructor({ message, statusCode }: { message: string; statusCode?: number }) {
      super(message);
      this.name = 'APICallError';
      this.statusCode = statusCode;
      this.isRetryable = statusCode == null ? false : statusCode >= 500 || statusCode === 429;
    }
  },
}));

const mockResolveModelTuple = vi.fn();
const mockGetModel = vi.fn();
vi.mock('../agents/providers.js', () => ({
  getModel: (provider: string, model: string, options?: unknown) => {
    mockGetModel(provider, model, options);
    return { provider, model };
  },
  resolveModelTuple: (...args: unknown[]) => mockResolveModelTuple(...args),
  VISION_MODEL: { provider: 'mistral', model: 'pixtral-large-latest' },
  isVisionCapable: () => true,
}));

vi.mock('../../../services/ai/modelDiscovery.js', () => ({
  isReasoningCapable: (model: string) => model === 'mistral-medium-2604',
}));

const mockStreamWithReasoning = vi.fn();
vi.mock('../../../services/ai/regoloReasoningStream.js', () => ({
  isReasoningStreamModel: (provider: string, model: string) =>
    (provider === 'regolo' && (model.startsWith('qwen') || model === 'gemma4-31b')) ||
    (provider === 'litellm' && (model === 'verdigado-think' || model === 'verdigado-pro')) ||
    // Medium 3.5 HAT einen Roh-Reasoning-Pfad (Scaleway). Stand hier vorher auf
    // false und machte damit jede Aussage über das Zusammenspiel von Pin und
    // Streamer auf der Mistral-Lane wertlos — der Zweig war im Test unerreichbar.
    (provider === 'mistral' && model === 'mistral-medium-2604'),
  streamWithReasoning: (...args: unknown[]) => mockStreamWithReasoning(...args),
  ReasoningStreamUnavailableError: class ReasoningStreamUnavailableError extends Error {
    status: number;
    constructor(provider: string, status: number, body: string) {
      super(`${provider} reasoning stream unavailable: ${status} ${body}`);
      this.name = 'ReasoningStreamUnavailableError';
      this.status = status;
    }
  },
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

const { ReasoningStreamUnavailableError } =
  await import('../../../services/ai/regoloReasoningStream.js');

/** Aus dem 'ai'-Mock oben — dieselbe Klasse, die `classifyProviderError` prüft. */
const { APICallError } = (await import('ai')) as unknown as {
  APICallError: new (init: { message: string; statusCode?: number }) => Error;
};

const {
  resolveModel,
  streamWithFallback,
  streamForResolution,
  getFirstTokenDeadlineMs,
  thinksOnThisLane,
} = await import('./responseStreamingService.js');

const { TRUNCATION_NOTE } = await import('./turnAbortOutcome.js');

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

/** stream that emits the given parts, then completes. */
function streamOf(parts: Array<Record<string, unknown>>) {
  return {
    stream: (async function* () {
      for (const part of parts) yield part;
    })(),
  };
}

/** stream whose first part never arrives (hung upstream). */
function hungStream() {
  return {
    stream: (async function* () {
      await new Promise(() => {});
      yield { type: 'text-delta', text: 'unreachable' };
    })(),
  };
}

/**
 * A model that THINKS out loud past the deadline before answering: reasoning
 * deltas every 15s for 45s, then the answer. Healthy, just slow — the shape
 * that used to be killed at 20s on both lanes in a row.
 */
function slowThinkerThenAnswer() {
  return {
    stream: (async function* () {
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 15_000));
        yield { type: 'reasoning-delta', text: `denkt ${i}` };
      }
      yield { type: 'text-delta', text: 'Die Antwort.' };
    })(),
  };
}

/** Emits reasoning once, then goes silent forever — genuinely hung. */
function reasoningThenSilence() {
  return {
    stream: (async function* () {
      yield { type: 'reasoning-delta', text: 'denkt' };
      await new Promise(() => {});
      yield { type: 'text-delta', text: 'unreachable' };
    })(),
  };
}

/** Emits a first token (clears the first-token deadline) then hangs in Phase 2. */
function firstTokenThenHang() {
  return {
    stream: (async function* () {
      yield { type: 'text-delta', text: 'Anfang ' };
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

function runStream(
  resolution: ReturnType<typeof makeResolution>,
  sse: SseWriterArg,
  salvage?: () => string | null
) {
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
    ...(salvage && { salvage }),
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
  mockGetModel.mockReset();
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

  it('defaults to 20s', () => {
    expect(getFirstTokenDeadlineMs('mistral', 'mistral-medium-2604')).toBe(20_000);
  });

  // Bis zum 01.09.2026 stand hier `('litellm', 'gemma') → 30_000` und war
  // grün, weil der Test den Zweig selbst aufrief. Erreichbar war er nicht:
  // keine Lane in AVAILABLE_MODELS deklariert noch `provider: 'litellm'`, seit
  // die Gemma-Lane am 21.08.2026 auf Cortecs zog. Ein Prüfmittel, das seinen
  // Zweig selbst am Leben hält, bewacht nichts — es verdeckt.
  it('holds the Gemma answer lane to the ordinary deadline — its host is Cortecs, not LiteLLM', () => {
    expect(getFirstTokenDeadlineMs('cortecs', 'gemma-4-31b-it', false)).toBe(20_000);
    // Auch der F0-Altname darf keine Sonderfrist zurückbringen.
    expect(getFirstTokenDeadlineMs('litellm', 'gemma')).toBe(20_000);
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

// ─── Eine Lesart von reasoningEffort ────────────────────────────────────────

describe('thinksOnThisLane', () => {
  // Mistrals Dial ist binär; `low` ist auf einem Modell ohne Low-Stufe ein
  // „nicht denken" — dieselbe Entscheidung, die mistralReasoningOption trifft.
  it('liest low auf der Mistral-Lane als NICHT denken', () => {
    expect(thinksOnThisLane('mistral', 'mistral-medium-2604', 'low')).toBe(false);
    expect(thinksOnThisLane('mistral', 'mistral-medium-2604', 'medium')).toBe(true);
    expect(thinksOnThisLane('mistral', 'mistral-medium-2604', 'high')).toBe(true);
  });

  it('lässt Lanes ohne binären Dial bei ihrer Lesart: alles außer off denkt', () => {
    expect(thinksOnThisLane('regolo', 'qwen3.5-122b', 'low')).toBe(true);
    expect(thinksOnThisLane('litellm', 'verdigado-pro', 'low')).toBe(true);
  });

  it('off heißt überall off', () => {
    expect(thinksOnThisLane('mistral', 'mistral-medium-2604', 'off')).toBe(false);
    expect(thinksOnThisLane('regolo', 'qwen3.5-122b', 'off')).toBe(false);
  });

  it('ein Mistral-Modell ohne Reasoning denkt auch bei high nicht', () => {
    expect(thinksOnThisLane('mistral', 'pixtral-large-latest', 'high')).toBe(false);
  });
});

describe('Pin und Streamer stellen dieselbe Frage', () => {
  const agentConfig = { provider: 'mistral', model: 'mistral-medium-2604' };

  // Der Kern des Fehlers: der Streamer hielt `low` für „denken" und ging auf
  // den Roh-Pfad, während der Pin es für „nicht denken" hielt und den Host auf
  // Scaleway ließ. Der „Ersatz über die Mistral-API" lief dann auf denselben
  // Host zurück, den der erste Versuch gerade abgelehnt hatte.
  it('pinnt den Host für einen denkenden Zug auf die Mistral-API', async () => {
    mockResolveModelTuple.mockResolvedValue(null);
    await resolveModel(agentConfig, undefined, 'req_test', {
      surface: 'notebook',
      complexity: 'complex',
    });
    // `toMatchObject`, nicht `toEqual`: die Aussage dieses Tests ist der PIN.
    // Im selben Options-Objekt reist seit 19.08.2026 auch das Ausweich-Veto
    // (`acceptTarget`) mit — es hat eigene Tests weiter unten.
    expect(mockGetModel.mock.calls.at(-1)?.[2]).toMatchObject({ needsReasoning: true });
  });

  it('pinnt NICHT, wenn der Zug auf dieser Lane gar nicht denkt (low)', async () => {
    mockResolveModelTuple.mockResolvedValue(null);
    await resolveModel(agentConfig, undefined, 'req_test', {
      surface: 'notebook',
      complexity: 'simple',
    });
    expect(mockGetModel.mock.calls.at(-1)?.[2]).toMatchObject({ needsReasoning: false });
  });

  /**
   * Das Ausweich-Veto reist mit — sonst greift es genau dort nicht, wo der
   * Ausfall beobachtet wurde.
   *
   * Am Proxy nachgemessen (19.08.2026) liegt hinter `litellm/verdigado-pro`
   * das Modell `gpt-oss:120b-ctx128k`, das `AVOID_AS_SYNTH` vom Schreiben der
   * Antwort ausschliesst. `resolveModel` wählt die Lane, die die Antwort
   * schreibt; wird sie als zäh vermerkt, sucht `modelSiblings` ein Ersatzpaar
   * und fand ohne dieses Veto genau jenes Modell. Im Abnahmelauf landete
   * dadurch Planer-Text beim Menschen („We will call gruenerator_search …").
   */
  it('gibt der Ausweichkette das Veto gegen ein nicht-schreibfähiges Modell mit', async () => {
    mockResolveModelTuple.mockResolvedValue(null);
    await resolveModel(agentConfig, undefined, 'req_test', {
      surface: 'notebook',
      complexity: 'simple',
    });
    const accept = mockGetModel.mock.calls.at(-1)?.[2]?.acceptTarget as
      ((t: { model: string }) => boolean) | undefined;
    expect(accept).toBeTypeOf('function');
    expect(accept?.({ model: 'verdigado-pro' })).toBe(false);
    expect(accept?.({ model: 'gpt-oss:120b-ctx128k' })).toBe(false);
    expect(accept?.({ model: 'gemma4-31b' })).toBe(true);
    expect(accept?.({ model: 'mistral-medium-2604' })).toBe(true);
  });

  it('nimmt bei low NICHT den Reasoning-Pfad — sonst hinge er über einem Host, den der Pin nicht umgestellt hat', async () => {
    mockStreamText.mockReturnValue(streamOf([{ type: 'text-delta', text: 'ok' }]));
    await streamForResolution({
      resolution: makeResolution({ reasoningEffort: 'low' }) as Parameters<
        typeof streamForResolution
      >[0]['resolution'],
      messages: MESSAGES,
      temperature: 0.2,
      sse: makeSse() as never,
    });
    expect(mockStreamWithReasoning).not.toHaveBeenCalled();
    // Und dann auch keine halbe Wahrheit: kein Reasoning angefragt.
    expect(mockStreamText.mock.calls[0][0].providerOptions).toBeUndefined();
  });

  it('nimmt bei high den Reasoning-Pfad', async () => {
    mockStreamWithReasoning.mockImplementation(async function* () {
      yield { type: 'text', delta: 'ok' };
    });
    await streamForResolution({
      resolution: makeResolution({ reasoningEffort: 'high' }) as Parameters<
        typeof streamForResolution
      >[0]['resolution'],
      messages: MESSAGES,
      temperature: 0.2,
      sse: makeSse() as never,
    });
    expect(mockStreamWithReasoning).toHaveBeenCalled();
  });

  // Das zweite Zuhause muss eines SEIN: fällt der Roh-Pfad aus, läuft der Zug
  // über die SDK — und dort mit Reasoning, nicht als stumme Kurzantwort.
  it('trägt das Reasoning in den zweiten Versuch, wenn der Roh-Pfad ausfällt', async () => {
    mockStreamWithReasoning.mockImplementation(() => {
      throw new ReasoningStreamUnavailableError('scaleway', 503, 'upstream weg');
    });
    mockStreamText.mockReturnValue(streamOf([{ type: 'text-delta', text: 'ok' }]));
    const text = await streamForResolution({
      resolution: makeResolution({ reasoningEffort: 'high' }) as Parameters<
        typeof streamForResolution
      >[0]['resolution'],
      messages: MESSAGES,
      temperature: 0.2,
      sse: makeSse() as never,
    });
    expect(text).toBe('ok');
    expect(mockStreamText.mock.calls[0][0].providerOptions).toEqual({
      mistral: { reasoningEffort: 'high' },
    });
  });
});

// ─── Ausgabedecke ───────────────────────────────────────────────────────────

describe('clampToModelOutputLimit', () => {
  /** Ein Zug, der die Decke des Modells überschreitet — die Notebook-Stufen
   *  `deep`/`ultra` fordern 40.000, Mistral Medium 3.5 nimmt 16.384. */
  function runWithMaxTokens(resolution: ReturnType<typeof makeResolution>, maxTokens: number) {
    return streamForResolution({
      resolution: resolution as Parameters<typeof streamForResolution>[0]['resolution'],
      messages: MESSAGES,
      maxTokens,
      temperature: 0.2,
      sse: makeSse() as never,
    });
  }

  it('kürzt eine Anforderung über der Modell-Decke, statt den Aufruf 400en zu lassen', async () => {
    mockStreamText.mockReturnValue(streamOf([{ type: 'text-delta', text: 'ok' }]));
    await runWithMaxTokens(makeResolution(), 40_000);
    expect(mockStreamText.mock.calls[0][0].maxOutputTokens).toBe(16_384);
  });

  it('lässt eine Anforderung unterhalb der Decke unangetastet', async () => {
    mockStreamText.mockReturnValue(streamOf([{ type: 'text-delta', text: 'ok' }]));
    await runWithMaxTokens(makeResolution(), 8_000);
    expect(mockStreamText.mock.calls[0][0].maxOutputTokens).toBe(8_000);
  });

  it('deckelt ein Modell ohne bekannte Decke nicht — der Anbieter entscheidet', async () => {
    mockStreamText.mockReturnValue(streamOf([{ type: 'text-delta', text: 'ok' }]));
    await runWithMaxTokens(
      makeResolution({ provider: 'regolo', modelName: 'gpt-oss-120b' }),
      40_000
    );
    expect(mockStreamText.mock.calls[0][0].maxOutputTokens).toBe(40_000);
  });

  it('gilt auch auf dem Reasoning-Pfad, der nicht über die AI SDK läuft', async () => {
    mockStreamWithReasoning.mockImplementation(async function* () {
      yield { type: 'text', delta: 'ok' };
    });
    await runWithMaxTokens(
      makeResolution({
        provider: 'litellm',
        modelName: 'verdigado-pro',
        reasoningEffort: 'high',
      }),
      40_000
    );
    // verdigado-pro hat keine Decke; die Zahl muss unverändert ankommen.
    expect(mockStreamWithReasoning.mock.calls[0][0].maxTokens).toBe(40_000);
  });
});

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

  it('lets a model that thinks past the deadline finish — reasoning is proof of life', async () => {
    // The live failure this closes: a research turn on verdigado-think died at
    // exactly 20s, fell back to regolo/gemma4-31b (also a reasoning lane, same
    // reasoning=medium) and died at exactly 20s again. The fallback could not
    // help, because a fixed one-shot deadline kills every long thinking phase.
    vi.useFakeTimers();
    mockStreamText.mockReturnValue(slowThinkerThenAnswer());
    const sse = makeSse();
    const resultPromise = runStream(
      makeResolution({ sibling: { provider: 'mistral', model: 'mistral-medium-2604' } }),
      sse
    );
    await vi.advanceTimersByTimeAsync(60_000);

    expect(await resultPromise).toBe('Die Antwort.');
    // No fallback: the primary was alive the whole time and answered.
    expect(sse.events.some((e) => e.event === 'fallback')).toBe(false);
    expect(sse.events.filter((e) => e.event === 'reasoning_delta')).toHaveLength(3);
  });

  it('still falls back when the model goes silent AFTER reasoning', async () => {
    // Rearm, don't disarm: one reasoning token used to buy immunity for the
    // rest of the turn, leaving only the 180s wall clock to catch a hang.
    vi.useFakeTimers();
    mockStreamText
      .mockReturnValueOnce(reasoningThenSilence())
      .mockReturnValueOnce(streamOf([{ type: 'text-delta', text: 'vom Sibling' }]));
    const sse = makeSse();
    const resultPromise = runStream(
      makeResolution({ sibling: { provider: 'mistral', model: 'mistral-medium-2604' } }),
      sse
    );
    await vi.advanceTimersByTimeAsync(25_000);

    expect(await resultPromise).toBe('vom Sibling');
    expect(sse.events.some((e) => e.event === 'fallback')).toBe(true);
  });

  it('ships the salvaged answer instead of an error when BOTH lanes are dead', async () => {
    // Live failure: a research turn retrieved 20 citations and a 1351-char
    // synthesis, then both lanes hit first_token_timeout writing the two
    // sentences of framing — and the finished, paid-for answer was discarded.
    vi.useFakeTimers();
    mockStreamText.mockReturnValue(hungStream());
    const sse = makeSse();
    const resultPromise = runStream(
      makeResolution({ sibling: { provider: 'mistral', model: 'mistral-medium-2604' } }),
      sse,
      () => 'Der Anteil erneuerbarer Energien lag 2024 bei 87 Prozent.'
    );
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await resultPromise;

    expect(result).toBe('Der Anteil erneuerbarer Energien lag 2024 bei 87 Prozent.');
    expect(textDeltas(sse)).toEqual(['Der Anteil erneuerbarer Energien lag 2024 bei 87 Prozent.']);
    // Exactly one representation: the answer. No error banner beside it.
    expect(sse.events.some((e) => e.event === 'error')).toBe(false);
    expect(sse.isEnded()).toBe(false);
  });

  it('still errors when there is nothing to salvage', async () => {
    vi.useFakeTimers();
    mockStreamText.mockReturnValue(hungStream());
    const sse = makeSse();
    const resultPromise = runStream(
      makeResolution({ sibling: { provider: 'mistral', model: 'mistral-medium-2604' } }),
      sse,
      () => null
    );
    await vi.advanceTimersByTimeAsync(60_000);

    expect(await resultPromise).toBeNull();
    expect(sse.events.some((e) => e.event === 'error')).toBe(true);
  });

  // Vorher: „does not time out before the provider-specific deadline (litellm
  // 30s)" — die Sonderfrist gibt es seit dem 01.09.2026 nicht mehr, und ihr
  // Zweig war zuletzt unerreichbar (keine Lane deklariert `provider:
  // 'litellm'`). Erhalten bleibt die Hälfte, die etwas aussagt: die Frist wird
  // ABGEWARTET und nicht vorzeitig gerissen — nur eben die gewöhnliche, auf
  // dem Host, der die Lane wirklich bedient.
  it('waits out the full 20s deadline on the Gemma answer lane before switching', async () => {
    vi.useFakeTimers();
    mockStreamText
      .mockReturnValueOnce(hungStream())
      .mockReturnValueOnce(streamOf([{ type: 'text-delta', text: 'fallback' }]));
    const sse = makeSse();
    const resultPromise = runStream(
      makeResolution({
        provider: 'cortecs',
        modelName: 'gemma-4-31b-it',
        sibling: { provider: 'mistral', model: 'mistral-medium-2604' },
      }),
      sse
    );
    await vi.advanceTimersByTimeAsync(19_000);
    expect(sse.events.some((e) => e.event === 'fallback')).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    await resultPromise;
    expect(sse.events.some((e) => e.event === 'fallback')).toBe(true);
  });

  it('caps Phase 2 with a turn wall-clock (never cleared) so a slow drain cannot run forever', async () => {
    vi.useFakeTimers();
    // First token arrives → first-token deadline is cleared; then Phase 2 hangs.
    mockStreamText.mockReturnValue(firstTokenThenHang());
    const sse = makeSse();
    void runStream(makeResolution(), sse);
    // let the generator yield its first token and clear the deadline
    await vi.advanceTimersByTimeAsync(0);
    const composed = (mockStreamText.mock.calls[0][0] as { abortSignal: AbortSignal }).abortSignal;
    expect(composed.aborted).toBe(false);
    // Advance past the 180s single-pass wall-clock — the un-cleared ceiling fires.
    await vi.advanceTimersByTimeAsync(180_000);
    expect(composed.aborted).toBe(true);
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

// ─── Upstream-Fehler vor dem ersten Token ───────────────────────────────────

/**
 * Ein 429/5xx vor dem ersten Token flog bis 19.08.2026 ROH an
 * `streamWithFallback` vorbei: kein StreamFailure, also kein Sibling-Versuch,
 * keine Salvage — der Zug erreichte den Client als `code:'internal'`, obwohl
 * der zweite Host hätte antworten können. So endete ein Bürgeranfragen-Zug mit
 * „Antwort konnte nicht generiert werden".
 *
 * Die Gegenprobe ist genauso wichtig: ein 4xx trägt denselben Payload zum
 * Sibling und bekäme dieselbe Absage, und ein Abbruch ist überhaupt kein
 * Upstream-Fehler — `classifyProviderError` stuft beide Abbruch-Arten als
 * `retryable` ein, also hinge ohne den Abbruch-Vorrang ein Sibling-Lauf an
 * jedem abgebrochenen Zug.
 */
function apiError(statusCode: number) {
  return new APICallError({ message: `upstream ${statusCode}`, statusCode });
}

describe('Upstream-Fehler vor dem ersten Token', () => {
  const withSibling = () =>
    makeResolution({ sibling: { provider: 'mistral', model: 'mistral-medium-2604' } });

  it('löst den Sibling-Fallback aus und meldet upstream_error', async () => {
    mockStreamText
      .mockReturnValueOnce(streamOf([{ type: 'error', error: apiError(503) }]))
      .mockReturnValueOnce(streamOf([{ type: 'text-delta', text: 'vom Sibling' }]));
    const sse = makeSse();

    const result = await runStream(withSibling(), sse);

    expect(result).toBe('vom Sibling');
    const fallback = sse.events.find((e) => e.event === 'fallback');
    expect(fallback).toBeDefined();
    expect((fallback!.data as { reason: string }).reason).toBe('upstream_error');
  });

  it('gilt auch für ein Anfragelimit (429)', async () => {
    mockStreamText
      .mockReturnValueOnce(streamOf([{ type: 'error', error: apiError(429) }]))
      .mockReturnValueOnce(streamOf([{ type: 'text-delta', text: 'vom Sibling' }]));
    const sse = makeSse();

    expect(await runStream(withSibling(), sse)).toBe('vom Sibling');
    expect(sse.events.some((e) => e.event === 'fallback')).toBe(true);
  });

  it('versucht bei einem 4xx KEINEN Sibling — derselbe Payload, dieselbe Absage', async () => {
    mockStreamText.mockReturnValueOnce(streamOf([{ type: 'error', error: apiError(400) }]));
    const sse = makeSse();

    await expect(runStream(withSibling(), sse)).rejects.toThrow('upstream 400');
    expect(sse.events.some((e) => e.event === 'fallback')).toBe(false);
  });

  it('meldet provider_unavailable, wenn auch der Sibling stirbt', async () => {
    mockStreamText
      .mockReturnValueOnce(streamOf([{ type: 'error', error: apiError(503) }]))
      .mockReturnValueOnce(streamOf([{ type: 'error', error: apiError(502) }]));
    const sse = makeSse();

    const result = await runStream(withSibling(), sse);

    expect(result).toBeNull();
    const error = sse.events.find((e) => e.event === 'error');
    expect((error!.data as { code: string }).code).toBe('provider_unavailable');
    expect(sse.isEnded()).toBe(true);
  });

  it('lässt einen Fehler NACH dem ersten Token unverändert — kein Token-Replay', async () => {
    mockStreamText.mockReturnValueOnce(
      streamOf([
        { type: 'text-delta', text: 'Anfang ' },
        { type: 'error', error: apiError(503) },
      ])
    );
    const sse = makeSse();

    const result = await runStream(withSibling(), sse);

    expect(result).toBeNull();
    expect(sse.events.some((e) => e.event === 'fallback')).toBe(false);
    const error = sse.events.find((e) => e.event === 'error');
    expect((error!.data as { code: string }).code).toBe('stream_interrupted');
  });

  it('der Roh-Reasoning-Pfad fällt bei 503 ebenfalls auf den Sibling', async () => {
    mockStreamWithReasoning.mockImplementationOnce(() => {
      throw new ReasoningStreamUnavailableError('regolo', 503, 'upstream down');
    });
    mockStreamText.mockReturnValueOnce(streamOf([{ type: 'text-delta', text: 'vom Sibling' }]));
    const sse = makeSse();

    const result = await runStream(
      makeResolution({
        model: { provider: 'regolo', model: 'gemma4-31b' },
        provider: 'regolo',
        modelName: 'gemma4-31b',
        reasoningEffort: 'medium',
        // Sibling BEWUSST ohne Roh-Reasoning-Pfad: sonst liefe der zweite
        // Versuch im Mock erneut über streamWithReasoning statt über das SDK.
        sibling: { provider: 'scaleway', model: 'gemma-4-26b-a4b-it' },
      }),
      sse
    );

    expect(result).toBe('vom Sibling');
    const fallback = sse.events.find((e) => e.event === 'fallback');
    expect((fallback!.data as { reason: string }).reason).toBe('upstream_error');
  });

  it('der Roh-Reasoning-Pfad fällt bei 400 NICHT auf den Sibling', async () => {
    mockStreamWithReasoning.mockImplementationOnce(() => {
      throw new ReasoningStreamUnavailableError('regolo', 400, 'bad payload');
    });
    const sse = makeSse();

    await expect(
      runStream(
        makeResolution({
          model: { provider: 'regolo', model: 'gemma4-31b' },
          provider: 'regolo',
          modelName: 'gemma4-31b',
          reasoningEffort: 'medium',
          sibling: { provider: 'mistral', model: 'mistral-medium-2604' },
        }),
        sse
      )
    ).rejects.toThrow(/400/);
    expect(sse.events.some((e) => e.event === 'fallback')).toBe(false);
  });
});

// ─── Abbruch: Uhr, Denk-Budget, Nutzer ──────────────────────────────────────

/**
 * Der Mock, ohne den die Uhr-Tests nichts beweisen: `firstTokenThenHang` oben
 * ignoriert das Abbruchsignal und endet nie — der Test dort konnte deshalb nur
 * prüfen, dass ein `AbortSignal` umkippt, nicht was danach passiert.
 *
 * Das echte AI SDK (7.0.58) stuft eine `DOMException/TimeoutError` als ABBRUCH
 * ein: es schiebt einen `abort`-Part in den Stream und schliesst ihn dann
 * regulär. Genau das bildet dieser Mock ab.
 */
function abortAware(pre: Array<Record<string, unknown>>, opts: { thinkEveryMs?: number } = {}) {
  return (args: { abortSignal: AbortSignal }) => ({
    stream: (async function* () {
      for (const part of pre) yield part;
      const { abortSignal } = args;
      if (opts.thinkEveryMs) {
        while (!abortSignal.aborted) {
          await new Promise((r) => setTimeout(r, opts.thinkEveryMs));
          if (abortSignal.aborted) break;
          yield { type: 'reasoning-delta', text: 'denkt weiter. ' };
        }
      } else {
        await new Promise<void>((resolve) => {
          if (abortSignal.aborted) return resolve();
          abortSignal.addEventListener('abort', () => resolve(), { once: true });
        });
      }
      yield { type: 'abort', reason: 'aborted' };
    })(),
  });
}

/** Roher Reasoning-Pfad: denkt, bis das Signal fällt — dann wirft er, wie ein
 *  abgebrochener `fetch`-Body es tut (kein `abort`-Part wie beim SDK). */
function reasoningStreamThatThinksUntilAbort() {
  return (params: { signal: AbortSignal }) => ({
    async *[Symbol.asyncIterator]() {
      while (true) {
        await new Promise((r) => setTimeout(r, 10_000));
        if (params.signal.aborted) {
          throw new DOMException('wall-clock exceeded', 'TimeoutError');
        }
        yield { type: 'reasoning', delta: 'denkt. ' };
      }
    },
  });
}

describe('Uhr-Abbruch verliert den Zug nicht mehr', () => {
  it('Phase 1: die Uhr ohne ein einziges Token ist ein Erst-Token-Timeout, kein leerer Upstream', async () => {
    vi.useFakeTimers();
    mockStreamText
      .mockImplementationOnce(abortAware([], { thinkEveryMs: 30_000 }))
      .mockImplementationOnce(() =>
        streamOf([{ type: 'text-delta', text: 'Antwort vom Sibling' }])
      );
    const sse = makeSse();
    const resultPromise = runStream(
      makeResolution({
        reasoningEffort: 'off',
        sibling: { provider: 'mistral', model: 'mistral-medium-2604' },
      }),
      sse
    );
    await vi.advanceTimersByTimeAsync(200_000);
    expect(await resultPromise).toBe('Antwort vom Sibling');
    const fallback = sse.events.find((e) => e.event === 'fallback');
    // Vorher: 'empty_completion' — der Abbruch sah aus wie ein leerer Upstream.
    expect((fallback!.data as { reason: string }).reason).toBe('first_token_timeout');
  });

  it('Phase 2: die halbe Antwort wird als unvollständig markiert statt als fertige gespeichert', async () => {
    vi.useFakeTimers();
    mockStreamText.mockImplementationOnce(
      abortAware([{ type: 'text-delta', text: 'Der Anfang der Antwort.' }])
    );
    const sse = makeSse();
    const resultPromise = runStream(makeResolution({ reasoningEffort: 'off' }), sse);
    await vi.advanceTimersByTimeAsync(200_000);
    const result = await resultPromise;
    expect(result).toContain('Der Anfang der Antwort.');
    expect(result).toContain(TRUNCATION_NOTE.trim());
    // Die Notiz ging AUCH über die Leitung — live und nach Reload dieselbe Warnung.
    expect(textDeltas(sse).join('')).toContain(TRUNCATION_NOTE.trim());
    expect(sse.events.some((e) => e.event === 'fallback')).toBe(false);
  });

  it('ein Nutzer-Abbruch löst KEINEN Sibling-Versuch aus', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    mockStreamText.mockImplementationOnce(abortAware([]));
    const sse = makeSse();
    const promise = streamForResolution({
      resolution: makeResolution({ reasoningEffort: 'off' }) as never,
      messages: MESSAGES,
      temperature: 0.7,
      sse: sse as never,
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockStreamText).toHaveBeenCalledTimes(1);
  });
});

describe('Denk-Budget', () => {
  it('bricht endloses Denken ab und schreibt den Zug ohne Denken zu Ende (Roh-Pfad)', async () => {
    vi.useFakeTimers();
    mockStreamWithReasoning.mockImplementationOnce((params: { signal: AbortSignal }) =>
      reasoningStreamThatThinksUntilAbort()(params)
    );
    mockStreamText.mockImplementationOnce(() =>
      streamOf([{ type: 'text-delta', text: 'Die Übertragung, ungedacht.' }])
    );
    const sse = makeSse();
    const resultPromise = runStream(makeResolution({ reasoningEffort: 'medium' }), sse);
    // 120 s Denk-Budget < 280 s Turn-Uhr der denkenden Lane: das Budget greift zuerst.
    await vi.advanceTimersByTimeAsync(125_000);
    expect(await resultPromise).toBe('Die Übertragung, ungedacht.');
    // Zweiter Versuch OHNE Denken — sonst liefe er in dieselbe Schleife.
    expect(mockStreamText.mock.calls[0][0]).not.toHaveProperty('providerOptions');
    expect(sse.events.some((e) => e.event === 'reasoning_delta')).toBe(true);
  });

  it('bricht endloses Denken auch auf dem SDK-Pfad ab', async () => {
    vi.useFakeTimers();
    // Scaleway fällt aus → SDK-Pfad übernimmt MIT Denken (providerOptions)…
    mockStreamWithReasoning.mockImplementationOnce(() => {
      throw new ReasoningStreamUnavailableError('mistral', 503, 'upstream down');
    });
    mockStreamText
      .mockImplementationOnce(abortAware([], { thinkEveryMs: 10_000 }))
      .mockImplementationOnce(() =>
        streamOf([{ type: 'text-delta', text: 'Antwort ohne Denken' }])
      );
    const sse = makeSse();
    const resultPromise = runStream(makeResolution({ reasoningEffort: 'high' }), sse);
    await vi.advanceTimersByTimeAsync(125_000);
    expect(await resultPromise).toBe('Antwort ohne Denken');
    expect(mockStreamText.mock.calls[0][0]).toHaveProperty('providerOptions');
    expect(mockStreamText.mock.calls[1][0]).not.toHaveProperty('providerOptions');
  });

  it('gründliches Denken innerhalb des Budgets läuft unangetastet durch', async () => {
    vi.useFakeTimers();
    mockStreamWithReasoning.mockImplementationOnce(() => ({
      async *[Symbol.asyncIterator]() {
        for (let i = 0; i < 4; i++) {
          await new Promise((r) => setTimeout(r, 15_000));
          yield { type: 'reasoning', delta: `Schritt ${i}. ` };
        }
        yield { type: 'text', delta: 'Gut überlegte Antwort.' };
      },
    }));
    const sse = makeSse();
    const resultPromise = runStream(makeResolution({ reasoningEffort: 'medium' }), sse);
    await vi.advanceTimersByTimeAsync(70_000);
    expect(await resultPromise).toBe('Gut überlegte Antwort.');
    expect(mockStreamText).not.toHaveBeenCalled();
  });
});
