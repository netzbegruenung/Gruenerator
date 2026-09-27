/**
 * Der Wächter für die ZWEI `getModel`-Türen.
 *
 * Die Umschrift in `toolCallIds.ts` nützt nichts, wenn sie an einer der beiden
 * Türen fehlt — und genau das ist hier schon einmal passiert: das
 * `acceptTarget`-Veto war an `services/ai/providers.ts` gesetzt und an
 * `routes/chat/agents/providers.ts` nicht, und weil der ganze Chat-Pfad durch
 * die zweite Tür geht, hat der Fix nichts bewirkt. Ein Test, der bloss das
 * Modul prüft, hätte es nicht gemerkt. Dieser hier geht durch die Türen.
 */
import { describe, expect, it, vi } from 'vitest';

import type { LanguageModel } from 'ai';

const WIRE = /^[a-zA-Z0-9]{9}$/;

const seen: { prompt?: unknown } = {};

function capturingModel(): LanguageModel {
  return {
    specificationVersion: 'v3',
    provider: 'fake',
    modelId: 'fake-model',
    doGenerate: async (params: { prompt: unknown }) => {
      seen.prompt = params.prompt;
      return {
        content: [{ type: 'text', text: 'ok' }],
        usage: { inputTokens: 1, outputTokens: 1 },
        finishReason: 'stop',
        warnings: [],
      };
    },
    doStream: async () => ({ stream: new ReadableStream({ start: (c) => c.close() }) }),
  } as unknown as LanguageModel;
}

const fakeClient = { chat: () => capturingModel() };

vi.mock('../providerInstances.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getGreenPTProvider: () => fakeClient,
    getLiteLLMProvider: () => fakeClient,
    getRegoloProvider: () => fakeClient,
    getScalewayProvider: () => fakeClient,
    getScalewayTextProvider: () => fakeClient,
    getMistralProvider: () => () => capturingModel(),
    isProviderConfigured: () => true,
  };
});

const PROMPT = [
  {
    role: 'assistant' as const,
    content: [
      { type: 'tool-call', toolCallId: 'tc_1787000540141_3', toolName: 'web_search', input: {} },
    ],
  },
  {
    role: 'tool' as const,
    content: [
      {
        type: 'tool-result',
        toolCallId: 'tc_1787000540141_3',
        toolName: 'web_search',
        output: { type: 'text', value: 'x' },
      },
    ],
  },
];

async function idsSeenBy(model: LanguageModel): Promise<string[]> {
  seen.prompt = undefined;
  await (model as unknown as { doGenerate: (p: unknown) => Promise<unknown> }).doGenerate({
    prompt: PROMPT,
  });
  return (seen.prompt as Array<{ content: Array<{ toolCallId: string }> }>).map(
    (m) => m.content[0].toolCallId
  );
}

describe('getModel — beide Türen machen Werkzeug-IDs leitungsfähig', () => {
  it('services/ai/providers.ts (Fassaden-Tür)', async () => {
    const { getModel } = await import('../providers.js');
    const [call, result] = await idsSeenBy(getModel('greenpt', 'mistral-small-3.2-24b'));
    expect(call).toMatch(WIRE);
    expect(result).toBe(call);
  });

  it('routes/chat/agents/providers.ts (Chat-Tür)', async () => {
    const { getModel } = await import('../../../routes/chat/agents/providers.js');
    const [call, result] = await idsSeenBy(getModel('greenpt', 'mistral-small-3.2-24b'));
    expect(call).toMatch(WIRE);
    expect(result).toBe(call);
  });
});
