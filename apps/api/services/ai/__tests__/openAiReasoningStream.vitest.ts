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
