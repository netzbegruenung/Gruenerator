import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { meliousFetch } from '../meliousThinkingFetch.js';

async function sentBody(body: string): Promise<Record<string, unknown>> {
  await meliousFetch('https://api.melious.ai/v1/chat/completions', { method: 'POST', body });
  const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  return JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
}

describe('meliousFetch — thinking off by default', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sets reasoning_effort='none' on a chat body that names none", async () => {
    const body = await sentBody(
      JSON.stringify({ model: 'gemma-4-31b:balanced', messages: [{ role: 'user', content: 'x' }] })
    );
    expect(body.reasoning_effort).toBe('none');
  });

  // Ein ausdrücklich gesetzter Wert bleibt: sonst würde ein Aufrufer, der
  // denken WILL, still auf `none` zurückgesetzt.
  it('keeps an explicit reasoning_effort', async () => {
    const body = await sentBody(
      JSON.stringify({
        model: 'gemma-4-31b:balanced',
        messages: [{ role: 'user', content: 'x' }],
        reasoning_effort: 'low',
      })
    );
    expect(body.reasoning_effort).toBe('low');
  });

  it('leaves non-chat bodies alone', async () => {
    const body = await sentBody(JSON.stringify({ model: 'bge-multilingual-gemma2', input: 'x' }));
    expect(body).not.toHaveProperty('reasoning_effort');
  });
});
