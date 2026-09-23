import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { MELIOUS_WIDE_MODEL, meliousFetch, meliousWireModel } from '../meliousThinkingFetch.js';

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

describe('meliousWireModel — Flavor nach Grösse', () => {
  const chat = (chars: number, extra: Record<string, unknown> = {}) => ({
    model: 'gemma-4-31b:balanced',
    messages: [{ role: 'user', content: 'x'.repeat(chars) }],
    ...extra,
  });

  it('bleibt bei einem kurzen Zug auf :balanced', () => {
    expect(meliousWireModel(chat(10_000, { max_tokens: 2_000 }))).toBeNull();
  });

  // ~45k Tokens nimmt der FI-Knoten hinter `:balanced` — 120k Zeichen sind
  // bei 3 Zeichen/Token 40k, plus Ausgabe darüber.
  it('tauscht einen grossen Zug auf :speed', () => {
    expect(meliousWireModel(chat(120_000, { max_tokens: 2_000 }))).toBe(MELIOUS_WIDE_MODEL);
  });

  it('zählt die Ausgabe mit, weil das Limit Prompt + Ausgabe ist', () => {
    expect(meliousWireModel(chat(100_000, { max_tokens: 1_000 }))).toBeNull();
    expect(meliousWireModel(chat(100_000, { max_tokens: 8_000 }))).toBe(MELIOUS_WIDE_MODEL);
  });

  it('fasst einen ausdrücklich gewählten Flavor nicht an', () => {
    expect(meliousWireModel({ ...chat(200_000), model: 'gemma-4-31b:eco' })).toBeNull();
  });
});

describe('meliousFetch — Flavor auf dem Draht', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('schickt einen grossen Zug an :speed', async () => {
    const body = await sentBody(
      JSON.stringify({
        model: 'gemma-4-31b:balanced',
        messages: [{ role: 'user', content: 'x'.repeat(150_000) }],
      })
    );
    expect(body.model).toBe(MELIOUS_WIDE_MODEL);
    expect(body.reasoning_effort).toBe('none');
  });
});
