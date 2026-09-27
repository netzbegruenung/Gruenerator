/**
 * Mistral `prompt_cache_key`: the key is sent where `@ai-sdk/mistral` builds the
 * request, and nowhere else. Driven through the real provider instances with a
 * stubbed global fetch, so the assertion is on the wire body, not on our own
 * option object.
 */

import { generateText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { promptCacheKeyForThread } from '../promptCacheKey.js';

const ORIGINAL_ENV = { ...process.env };

async function loadProviders(env: Record<string, string>) {
  vi.resetModules();
  Object.assign(process.env, env);
  return import('../providerInstances.js');
}

function captureBodies(chatCompletion: Record<string, unknown>) {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
      return new Response(JSON.stringify(chatCompletion), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    })
  );
  return bodies;
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

describe('promptCacheKeyForThread', () => {
  it('is a stable 32-hex hash per thread that does not leak the id', () => {
    const id = '3f1c9a52-7d44-4e1b-9a0e-1b2c3d4e5f60';
    const key = promptCacheKeyForThread(id);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(promptCacheKeyForThread(id)).toBe(key);
    expect(promptCacheKeyForThread('other-thread')).not.toBe(key);
    expect(key).not.toContain(id.slice(0, 8));
  });

  it('returns null without a thread', () => {
    expect(promptCacheKeyForThread(null)).toBeNull();
    expect(promptCacheKeyForThread('')).toBeNull();
  });
});

describe('prompt_cache_key on the wire', () => {
  it('reaches the Mistral API body', async () => {
    const { getMistralProvider } = await loadProviders({ MISTRAL_API_KEY: 'test-key' });
    const bodies = captureBodies(COMPLETION);

    await generateText({
      model: getMistralProvider()('mistral-medium-2604'),
      prompt: 'hi',
      providerOptions: { mistral: { promptCacheKey: 'abc123' } },
    });

    expect(bodies[0]?.prompt_cache_key).toBe('abc123');
  });

  it('does not reach Scaleway when Mistral Medium is routed there', async () => {
    const { getScalewayProvider, routeMistralModel } = await loadProviders({
      MISTRAL_API_KEY: 'test-key',
      SCALEWAY_API_KEY: 'scw-key',
      SCALEWAY_MISTRAL_ROUTING: 'true',
    });
    const routed = routeMistralModel('mistral-medium-2604');
    expect(routed.upstream).toBe('scaleway');
    const bodies = captureBodies(COMPLETION);

    await generateText({
      model: getScalewayProvider().chat(routed.model),
      prompt: 'hi',
      providerOptions: { mistral: { promptCacheKey: 'abc123' } },
    });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toHaveProperty('prompt_cache_key');
  });
});
