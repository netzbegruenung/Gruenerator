/**
 * `reasoning_effort` auf dem Draht, für Mistral-Modelle, die `@ai-sdk/mistral`
 * nicht kennt (../mistralReasoningFetch.ts). Gefahren durch die echten
 * Provider-Instanzen mit gestubbtem globalem fetch — geprüft wird der Body,
 * nicht unser Options-Objekt.
 */

import { generateText, tool } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const ORIGINAL_ENV = { ...process.env };

async function loadProviders() {
  vi.resetModules();
  process.env.MISTRAL_API_KEY = 'test-key';
  return import('../providerInstances.js');
}

function captureRequests() {
  const requests: { body: Record<string, unknown>; headers: Headers }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      requests.push({
        body: JSON.parse(init.body as string) as Record<string, unknown>,
        headers: new Headers(init.headers),
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

const HIGH = { mistral: { reasoningEffort: 'high' as const } };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('reasoning_effort for Mistral models the SDK does not know', () => {
  it('reaches the body for mistral-large-4, without leaking the internal header', async () => {
    const { getMistralChatModel } = await loadProviders();
    const requests = captureRequests();

    await generateText({
      model: getMistralChatModel('mistral-large-4'),
      prompt: 'hi',
      providerOptions: HIGH,
    });

    expect(requests[0]?.body.model).toBe('mistral-large-4');
    expect(requests[0]?.body.reasoning_effort).toBe('high');
    expect(requests[0]?.headers.has('x-gruenerator-reasoning-effort')).toBe(false);
  });

  it('reaches the body when a tool schema names a reasoning_effort parameter', async () => {
    const { getMistralChatModel } = await loadProviders();
    const requests = captureRequests();

    await generateText({
      model: getMistralChatModel('mistral-large-4'),
      prompt: 'hi',
      providerOptions: HIGH,
      tools: {
        plan: tool({ inputSchema: z.object({ reasoning_effort: z.string() }) }),
      },
    });

    expect(requests[0]?.body.reasoning_effort).toBe('high');
  });

  it('stays off when the caller did not ask for it', async () => {
    const { getMistralChatModel } = await loadProviders();
    const requests = captureRequests();

    await generateText({ model: getMistralChatModel('mistral-large-4'), prompt: 'hi' });

    expect(requests[0]?.body).not.toHaveProperty('reasoning_effort');
  });

  it('leaves models the SDK already handles unchanged', async () => {
    const { getMistralChatModel } = await loadProviders();
    const requests = captureRequests();

    await generateText({
      model: getMistralChatModel('mistral-medium-2604'),
      prompt: 'hi',
      providerOptions: { mistral: { reasoningEffort: 'high', promptCacheKey: 'abc' } },
    });

    expect(requests[0]?.body.reasoning_effort).toBe('high');
    expect(requests[0]?.body.prompt_cache_key).toBe('abc');
  });

  // Gegenprobe: so verhält sich das SDK ohne den Wrapper. Wird dieser Test rot,
  // kennt eine neue SDK-Version die ID — dann kann ../mistralReasoningFetch.ts weg.
  it('the bare SDK still drops it for mistral-large-4', async () => {
    const { createMistral } = await import('@ai-sdk/mistral');
    const requests = captureRequests();

    await generateText({
      model: createMistral({ apiKey: 'test-key' })('mistral-large-4'),
      prompt: 'hi',
      providerOptions: HIGH,
    });

    expect(requests[0]?.body).not.toHaveProperty('reasoning_effort');
  });
});
