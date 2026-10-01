import { afterEach, describe, expect, it, vi } from 'vitest';

import { isReasoningStreamModel, streamWithReasoning } from '../openAiReasoningStream.js';

describe('isReasoningStreamModel', () => {
  it('returns false for the retired regolo provider (F0 name, no reasoning stream)', () => {
    expect(isReasoningStreamModel('regolo', 'gemma4-31b')).toBe(false);
  });

  /**
   * Seit dem 29.08.2026 denkt auf `litellm` NICHTS mehr — der Host bedient kein
   * Ziel, `getModel` biegt den Namen vorher auf Cortecs um
   * (services/ai/litellmRetired.ts). Der Wächter steht hier trotzdem: käme der
   * Zweig zurück, ohne dass die Stilllegung aufgehoben wird, ginge ein Denk-
   * Strom an einen Host, der die Anfrage gar nicht bekommt.
   */
  it.each(['verdigado-think', 'verdigado-pro', 'gemma'])(
    'returns false for the retired litellm alias %s',
    (model) => {
      expect(isReasoningStreamModel('litellm', model)).toBe(false);
    }
  );

  /**
   * Der Cortecs-Zweig ist der Grund, warum die Gemma-Antwortlane den Host
   * wechseln konnte, ohne das Denken zu verlieren. Ohne ihn wäre
   * `reasoning: 'low'` auf 14 Intents ein stiller No-Op geworden — der Wächter
   * in routes/chat/agents/autoPolicy.vitest.ts hat genau das abgefangen.
   */
  it('returns true for gemma-4-31b-it on cortecs (der Denk-Hebel dort ist enable_thinking)', () => {
    expect(isReasoningStreamModel('cortecs', 'gemma-4-31b-it')).toBe(true);
  });

  it('returns false for the old `gemma4-31b` spelling of the same weights asked on cortecs', () => {
    // Dieselben Gewichte, andere Kennung. Ein Treffer hier hiesse, dass der
    // Denk-Strom eine Modell-ID an einen Host schickt, der sie nicht führt.
    expect(isReasoningStreamModel('cortecs', 'gemma4-31b')).toBe(false);
  });

  // Melious' Gemma ist der Ausweich der Antwortlane. Ohne diesen Zweig liefe ein
  // Denk-Zug nach dem Ausweich über das SDK, wo meliousThinkingFetch `none`
  // setzt — das Denken wäre still weg.
  it('returns true for gemma-4-31b:balanced on melious', () => {
    expect(isReasoningStreamModel('melious', 'gemma-4-31b:balanced')).toBe(true);
    expect(isReasoningStreamModel('melious', 'deepseek-v4.1-flash')).toBe(true);
  });

  it('returns false for gpt-oss-120b asked on litellm', () => {
    expect(isReasoningStreamModel('litellm', 'gpt-oss-120b')).toBe(false);
  });
});

describe.skipIf(!process.env.MELIOUS_API_KEY)('streamWithReasoning — live integration', () => {
  it('throws ReasoningStreamUnavailableError on unknown model', async () => {
    const run = async (): Promise<void> => {
      for await (const _chunk of streamWithReasoning({
        provider: 'melious',
        model: 'this-model-does-not-exist',
        messages: [{ role: 'user', content: 'x' }],
        maxTokens: 10,
        temperature: 0,
      })) {
        void _chunk;
      }
    };
    // „unavailable", nicht „failed": das ist der Wortlaut von
    // ReasoningStreamUnavailableError — *unavailable* heisst „nichts ist beim
    // Nutzer angekommen, ein anderer Host darf es nochmal versuchen", ein Abriss
    // MITTEN im Strom ist ein schlichter Error und darf NICHT wiederholt werden.
    await expect(run()).rejects.toThrow(/melious reasoning stream unavailable/);
  }, 15_000);
});

describe('streamWithReasoning — Melious-Flavor nach Grösse', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  async function sentModel(chars: number): Promise<unknown> {
    vi.resetModules();
    process.env.MELIOUS_API_KEY = 'mel-key';
    const { streamWithReasoning: stream } = await import('../openAiReasoningStream.js');
    let body: Record<string, unknown> = {};
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response('data: [DONE]\n', { status: 200 });
    });
    for await (const _chunk of stream({
      provider: 'melious',
      model: 'gemma-4-31b:balanced',
      messages: [{ role: 'user', content: 'x'.repeat(chars) }],
      maxTokens: 2_000,
      temperature: 0,
    })) {
      void _chunk;
    }
    return body.model;
  }

  it('bleibt bei einem kurzen Denk-Zug auf :balanced', async () => {
    expect(await sentModel(1_000)).toBe('gemma-4-31b:balanced');
  });

  it('schickt einen grossen Denk-Zug an :speed', async () => {
    expect(await sentModel(150_000)).toBe('gemma-4-31b:speed');
  });
});

describe('streamWithReasoning — Fehlerarten und Delta-Formen', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  async function load() {
    vi.resetModules();
    process.env.MELIOUS_API_KEY = 'mel-key';
    return import('../openAiReasoningStream.js');
  }

  function streamOf(stream: AsyncGenerator<{ type: string; delta: string }>) {
    return async () => {
      const chunks: Array<{ type: string; delta: string }> = [];
      for await (const chunk of stream) chunks.push(chunk);
      return chunks;
    };
  }

  const PARAMS = {
    provider: 'melious',
    model: 'gemma-4-31b:balanced',
    messages: [{ role: 'user' as const, content: 'hi' }],
    temperature: 0,
  };

  it('wirft ReasoningStreamUnavailableError, wenn der Upstream nie geantwortet hat', async () => {
    const { streamWithReasoning, ReasoningStreamUnavailableError } = await load();
    vi.stubGlobal('fetch', async () => new Response('upstream down', { status: 503 }));

    // Der eigene Typ lässt streamForResolution „nie bedient" von „mitten im
    // Strom gestorben" unterscheiden — nur Ersteres darf wiederholt werden.
    await expect(streamOf(streamWithReasoning(PARAMS))()).rejects.toBeInstanceOf(
      ReasoningStreamUnavailableError
    );
    await expect(streamOf(streamWithReasoning(PARAMS))()).rejects.toMatchObject({ status: 503 });
  });

  it('tarnt einen Abriss mitten im Strom nicht als wiederholbar', async () => {
    const { streamWithReasoning, ReasoningStreamUnavailableError } = await load();
    // Chunk und Fehler in GETRENNTEN pulls: `controller.error()` verwirft, was
    // noch in der Schlange liegt — sonst prüfte der Test einen Strom, der nie
    // etwas geliefert hat.
    let pulls = 0;
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              if (pulls++ === 0) {
                controller.enqueue(
                  new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hal"}}]}\n')
                );
                return;
              }
              controller.error(new Error('connection reset'));
            },
          }),
          { status: 200 }
        )
    );

    const chunks: string[] = [];
    const consume = async () => {
      for await (const chunk of streamWithReasoning(PARAMS)) chunks.push(chunk.delta);
    };

    await expect(consume()).rejects.not.toBeInstanceOf(ReasoningStreamUnavailableError);
    expect(chunks).toEqual(['Hal']);
  });

  it('liest Denken aus delta.reasoning_content und delta.reasoning', async () => {
    const { streamWithReasoning } = await load();
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n' +
            'data: {"choices":[{"delta":{"reasoning_content":"Okay"}}]}\n' +
            'data: {"choices":[{"delta":{"reasoning":", der"}}]}\n' +
            'data: {"choices":[{"delta":{"content":"120 km"}}]}\n' +
            'data: [DONE]\n',
          { status: 200 }
        )
    );

    expect(await streamOf(streamWithReasoning(PARAMS))()).toEqual([
      { type: 'reasoning', delta: 'Okay' },
      { type: 'reasoning', delta: ', der' },
      { type: 'text', delta: '120 km' },
    ]);
  });
});

/**
 * Der rohe Strom geht an `withUsageTracking` vorbei. Für Melious bucht er die
 * Tokens deshalb selbst — aus dem Usage-Chunk, den `include_usage` anhängt.
 * Ohne das tauchte die Lane „Panda" weder im Nutzungs-Tab noch in der
 * Cache-Quote auf.
 */
describe('streamWithReasoning — Melious bucht Tokens samt Cache-Anteil', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.doUnmock('../../usage/UsageTrackingService.js');
  });

  it('fordert include_usage an und verbucht prompt, completion und cached_tokens', async () => {
    vi.resetModules();
    process.env.MELIOUS_API_KEY = 'mel-key';
    const recordTokenUsage = vi.fn();
    vi.doMock('../../usage/UsageTrackingService.js', () => ({ recordTokenUsage }));
    const { streamWithReasoning: stream } = await import('../openAiReasoningStream.js');

    let body: Record<string, unknown> = {};
    const sse = [
      `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'hm' } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: '391' } }] })}`,
      `data: ${JSON.stringify({
        choices: [],
        usage: {
          prompt_tokens: 11635,
          completion_tokens: 18,
          prompt_tokens_details: { cached_tokens: 11520 },
        },
      })}`,
      'data: [DONE]',
      '',
    ].join('\n');
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response(sse, { status: 200 });
    });

    const chunks: string[] = [];
    for await (const chunk of stream({
      provider: 'melious',
      model: 'deepseek-v4.1-flash',
      messages: [{ role: 'user', content: '17*23?' }],
      temperature: 0,
    })) {
      chunks.push(`${chunk.type}:${chunk.delta}`);
    }

    expect(chunks).toEqual(['reasoning:hm', 'text:391']);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.model).toBe('deepseek-v4.1-flash');
    expect(recordTokenUsage).toHaveBeenCalledWith({
      provider: 'melious',
      model: 'deepseek-v4.1-flash',
      inputTokens: 11635,
      outputTokens: 18,
      cachedInputTokens: 11520,
    });
  });
});
