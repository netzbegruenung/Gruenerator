import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { greenptFetchWithThinkingDisabled } from '../greenptThinkingFetch.js';

function sentBody(): Record<string, unknown> {
  const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  return JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
}

describe('greenptFetchWithThinkingDisabled — body transformation', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('disables thinking for both backend families in one request', async () => {
    // GreenPT fans out to several backends behind one endpoint, so the request
    // has to carry the vLLM flag AND the Ollama flag — the caller does not know
    // which one is serving the chosen model.
    await greenptFetchWithThinkingDisabled('https://api.greenpt.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemma4', messages: [{ role: 'user', content: '17*24' }] }),
    });

    const body = sentBody();
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(body.think).toBe(false);
    expect(body.model).toBe('gemma4');
  });

  it('does not send reasoning_effort', async () => {
    // Deliberate: reasoning_effort is enum-restricted per backend (Mistral takes
    // none|high, most vLLM lanes low|medium|high). Sending `none` where it is
    // rejected turns a degraded answer into a 400.
    await greenptFetchWithThinkingDisabled('https://api.greenpt.ai/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'glm-5.2', messages: [{ role: 'user', content: 'x' }] }),
    });

    expect(sentBody()).not.toHaveProperty('reasoning_effort');
  });

  it('preserves existing chat_template_kwargs fields', async () => {
    await greenptFetchWithThinkingDisabled('https://api.greenpt.ai/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'qwen3.5-122b',
        messages: [{ role: 'user', content: 'x' }],
        chat_template_kwargs: { custom_flag: true },
      }),
    });

    expect(sentBody().chat_template_kwargs).toEqual({
      custom_flag: true,
      enable_thinking: false,
    });
  });

  it('leaves non-chat-completion bodies untouched', async () => {
    // Only bodies that look like a chat completion (model + messages) are
    // rewritten — an embeddings or upload call must pass through verbatim.
    const original = JSON.stringify({ input: 'text', model: 'embed' });
    await greenptFetchWithThinkingDisabled('https://api.greenpt.ai/v1/embeddings', {
      method: 'POST',
      body: original,
    });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init as RequestInit).body).toBe(original);
  });

  it('passes a non-JSON body through unchanged', async () => {
    await greenptFetchWithThinkingDisabled('https://api.greenpt.ai/v1/files', {
      method: 'POST',
      body: 'not-json',
    });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init as RequestInit).body).toBe('not-json');
  });
});
