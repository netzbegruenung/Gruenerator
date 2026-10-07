/**
 * `reasoning_effort` auf dem Draht. `@ai-sdk/mistral` verwirft es STILL für
 * jede ID, die nicht auf seiner Allowlist steht — so dachte Medium bis 4.0.42
 * nie, Large 4 bis 4.0.58 nicht. Gefahren durch die echten Provider-Instanzen
 * mit gestubbtem globalem fetch: geprüft wird der Body, nicht unser
 * Options-Objekt. Wer einer Lane ein neues Mistral-Modell gibt, trägt es in
 * THINKING_MISTRAL_MODELS ein.
 */

import { generateText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

async function loadProviders() {
  vi.resetModules();
  process.env.MISTRAL_API_KEY = 'test-key';
  return import('../providerInstances.js');
}

function captureRequests() {
  const requests: { body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      requests.push({
        body: JSON.parse(init.body as string) as Record<string, unknown>,
      });
      return new Response(JSON.stringify(COMPLETION), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    })
  );
  return requests;
}

const COMPLETION = {
  id: 'x',
  object: 'chat.completion',
  created: 0,
  model: 'm',
  choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const THINKING_MISTRAL_MODELS = ['mistral-large-4', 'mistral-medium-2604'] as const;

describe('reasoning_effort reaches Mistral', () => {
  it.each(THINKING_MISTRAL_MODELS)('lands in the body for %s', async (model) => {
    const { getMistralChatModel } = await loadProviders();
    const requests = captureRequests();

    await generateText({
      model: getMistralChatModel(model),
      prompt: 'hi',
      providerOptions: { mistral: { reasoningEffort: 'high', promptCacheKey: 'abc' } },
    });

    expect(requests[0]?.body.model).toBe(model);
    expect(requests[0]?.body.reasoning_effort).toBe('high');
    expect(requests[0]?.body.prompt_cache_key).toBe('abc');
  });

  it('stays off when the caller did not ask for it', async () => {
    const { getMistralChatModel } = await loadProviders();
    const requests = captureRequests();

    await generateText({ model: getMistralChatModel('mistral-large-4'), prompt: 'hi' });

    expect(requests[0]?.body).not.toHaveProperty('reasoning_effort');
  });
});
