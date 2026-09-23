import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { captureMeliousImpact } from '../meliousImpact.js';
import { MELIOUS_WIDE_MODEL, meliousFetch, meliousWireModel } from '../meliousThinkingFetch.js';

vi.mock('../meliousImpact.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../meliousImpact.js')>()),
  captureMeliousImpact: vi.fn((response: Response) => response),
}));

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

  // `:eco` liegt auf demselben FI-Knoten — ein MELIOUS_DEFAULT_MODEL-Override
  // darauf muss genauso ausweichen, sonst stimmt das 128k-Fenster der Lane nicht.
  it('tauscht auch die anderen FI-Flavors', () => {
    expect(meliousWireModel({ ...chat(200_000), model: 'gemma-4-31b:eco' })).toBe(
      MELIOUS_WIDE_MODEL
    );
    expect(meliousWireModel({ ...chat(200_000), model: 'gemma-4-31b' })).toBe(MELIOUS_WIDE_MODEL);
  });

  it('fasst ein ausdrückliches :speed und fremde Modelle nicht an', () => {
    expect(meliousWireModel({ ...chat(200_000), model: MELIOUS_WIDE_MODEL })).toBeNull();
    expect(meliousWireModel({ ...chat(200_000), model: 'gemma-3-27b-it' })).toBeNull();
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

  // Die Token-Zeile schreibt das SDK unter dem logischen Namen; bucht die
  // Messung unter dem Draht-Namen, liegen Tokens und Energie in zwei Zeilen.
  it('bucht die Messung unter dem logischen Namen, nicht unter :speed', async () => {
    await sentBody(
      JSON.stringify({
        model: 'gemma-4-31b:balanced',
        messages: [{ role: 'user', content: 'x'.repeat(150_000) }],
      })
    );
    expect(vi.mocked(captureMeliousImpact)).toHaveBeenLastCalledWith(
      expect.any(Response),
      'gemma-4-31b:balanced',
      undefined
    );
  });
});
