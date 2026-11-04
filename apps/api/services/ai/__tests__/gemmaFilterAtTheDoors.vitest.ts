/**
 * Der Wächter für den Gemma-Filter an der Fassaden-Tür.
 *
 * Melious liefert standardmässig Gemma 4. Die Chat-Tür
 * (`routes/chat/agents/providers.ts`) setzt den Filter dort, die Fassaden-Tür
 * setzte ihn nur bei Cortecs — Gemmas `<|tool_call>…<tool_call|>` und
 * `<|channel>…<channel|>` kamen auf dem Fassadenweg über Melious also wörtlich
 * als Text an. Wie bei `toolCallIdsAtTheDoors.vitest.ts`: der Test geht durch
 * die Tür, nicht bloss durch das Modul. Die Chat-Tür steht nicht hier, weil sie
 * ohne `MELIOUS_API_KEY` auf Mistral ausweicht und der Test dann ins Netz ginge.
 */
import { describe, expect, it, vi } from 'vitest';

import type { LanguageModel } from 'ai';

const RAW = '<|channel>thought\n<channel|>Hallo <|tool_call>call:x{a:1}<tool_call|>Welt';

function markerModel(): LanguageModel {
  return {
    specificationVersion: 'v3',
    provider: 'fake',
    modelId: 'fake-model',
    doGenerate: async () => ({
      content: [{ type: 'text', text: RAW }],
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: 'stop',
      warnings: [],
    }),
    doStream: async () => ({ stream: new ReadableStream({ start: (c) => c.close() }) }),
  } as unknown as LanguageModel;
}

const fakeClient = { chat: () => markerModel() };

vi.mock('../providerInstances.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getMeliousProvider: () => fakeClient,
    getCortecsProvider: () => fakeClient,
    isProviderConfigured: () => true,
  };
});

async function textOf(model: LanguageModel): Promise<string> {
  const { content } = await (
    model as unknown as {
      doGenerate: (p: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }>;
    }
  ).doGenerate({ prompt: [] });
  return content.map((p) => p.text ?? '').join('');
}

describe('getModel (services/ai/providers.ts) filtert Gemma-Marker', () => {
  const lanes = [
    ['melious', 'gemma-4-31b:balanced'],
    ['cortecs', 'gemma-4-31b-it'],
  ] as const;

  it.each(lanes)('%s', async (provider, model) => {
    const { getModel } = await import('../providers.js');
    expect(await textOf(getModel(provider, model))).toBe('Hallo Welt');
  });
});
