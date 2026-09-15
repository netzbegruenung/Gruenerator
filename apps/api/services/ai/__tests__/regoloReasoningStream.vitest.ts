import { describe, it, expect } from 'vitest';

import { isReasoningStreamModel, streamWithReasoning } from '../regoloReasoningStream.js';

describe('isReasoningStreamModel', () => {
  it('returns true for gpt-oss-120b on regolo', () => {
    expect(isReasoningStreamModel('regolo', 'gpt-oss-120b')).toBe(true);
  });

  it('returns true for gemma4-31b on regolo (overflow reasoning lane)', () => {
    expect(isReasoningStreamModel('regolo', 'gemma4-31b')).toBe(true);
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

  it('returns false for the Regolo spelling of the same weights asked on cortecs', () => {
    // Dieselben Gewichte, andere Kennung. Ein Treffer hier hiesse, dass der
    // Denk-Strom eine Modell-ID an einen Host schickt, der sie nicht führt.
    expect(isReasoningStreamModel('cortecs', 'gemma4-31b')).toBe(false);
  });

  it('returns false for a regolo-only model asked on litellm', () => {
    expect(isReasoningStreamModel('litellm', 'gpt-oss-120b')).toBe(false);
  });
});

describe.skipIf(!process.env.REGOLO_API_KEY)('streamWithReasoning — live integration', () => {
  it('yields both reasoning and text chunks from gemma4-31b', async () => {
    const chunks: Array<{ type: 'text' | 'reasoning'; delta: string }> = [];

    for await (const chunk of streamWithReasoning({
      provider: 'regolo',
      model: 'gemma4-31b',
      messages: [
        {
          role: 'system',
          content: 'Answer in at most 3 words. Do not explain.',
        },
        { role: 'user', content: 'Say only "Hallo"' },
      ],
      maxTokens: 2000,
      temperature: 0,
    })) {
      chunks.push(chunk);
      if (chunks.length > 500) break; // safety
    }

    const textChunks = chunks.filter((c) => c.type === 'text');
    const reasoningChunks = chunks.filter((c) => c.type === 'reasoning');

    expect(reasoningChunks.length).toBeGreaterThan(0);
    expect(textChunks.length).toBeGreaterThan(0);

    const fullText = textChunks.map((c) => c.delta).join('');
    expect(fullText.toLowerCase()).toContain('hallo');
  }, 30_000);

  it('throws a useful error on unknown model', async () => {
    const run = async (): Promise<void> => {
      for await (const _chunk of streamWithReasoning({
        provider: 'regolo',
        model: 'this-model-does-not-exist',
        messages: [{ role: 'user', content: 'x' }],
        maxTokens: 10,
        temperature: 0,
      })) {
        void _chunk;
      }
    };
    // „unavailable", nicht „failed": das ist der Wortlaut von
    // ReasoningStreamUnavailableError, und der Unterschied trägt Bedeutung —
    // *unavailable* heisst „nichts ist beim Nutzer angekommen, ein anderer Host
    // darf es nochmal versuchen", während ein Abriss MITTEN im Strom als
    // schlichter Error geworfen wird und NICHT wiederholt werden darf.
    //
    // Der Regex suchte bis zum 25.08.2026 „failed" und konnte deshalb nie
    // bestehen. Aufgefallen ist das erst jetzt, weil dieser Block ohne
    // REGOLO_API_KEY übersprungen wird — in der CI läuft er nicht, lokal
    // scheiterte er still.
    await expect(run()).rejects.toThrow(/regolo reasoning stream unavailable/);
  }, 15_000);
});
