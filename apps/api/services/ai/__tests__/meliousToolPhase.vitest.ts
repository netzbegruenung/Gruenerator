import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const recordImpact = vi.fn();
vi.mock('../../usage/UsageTrackingService.js', () => ({ recordImpact }));
vi.mock('../../../utils/usageContext.js', () => ({
  getUsageUserId: () => 'u1',
  getUsageFeature: () => 'chat',
}));

const { meliousFetch } = await import('../meliousThinkingFetch.js');

/**
 * What Melious streams for the tool phase (shape measured 2026-10-28: tool call
 * as deltas, `environment_impact` in the final chunk next to `usage`).
 */
const frames = [
  {
    id: 'abc',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gemma-4-31b',
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'notebook_search', arguments: '{"query":"Bahn"}' },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  },
  {
    id: 'abc',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gemma-4-31b',
    choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
  },
  {
    id: 'abc',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gemma-4-31b',
    choices: [],
    usage: { prompt_tokens: 120, completion_tokens: 12, total_tokens: 132 },
    environment_impact: {
      energy_kwh: 0.00001,
      carbon_g_co2: 0.002,
      provider_id: 'infercom',
      location: 'DE',
    },
  },
];
const sse = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('') + 'data: [DONE]\n\n';

describe('meliousFetch — tool phase streams and is measured', () => {
  let originalFetch: typeof fetch;
  let sent: Record<string, unknown>;

  beforeEach(() => {
    recordImpact.mockClear();
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_url, init) => {
      sent = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
      return new Response(sse, { headers: { 'content-type': 'text/event-stream' } });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const model = () =>
    createOpenAI({ baseURL: 'https://api.melious.ai/v1', apiKey: 'k', fetch: meliousFetch }).chat(
      'gemma-4-31b:balanced'
    );

  it('keeps the tool phase streaming and records the impact from the final chunk', async () => {
    // Bis 28.10.2026 fragte diese Phase nicht-gestreamt und spielte die Antwort
    // dem SDK vor (`replayAsStream`), weil Melious' Streams keine Messung
    // trugen. Heute tun sie es, also streamt der Planer wieder Token für Token.
    const run = streamText({
      model: model(),
      prompt: 'Was sagt das Wahlprogramm zur Bahn?',
      tools: { notebook_search: tool({ inputSchema: z.object({ query: z.string() }) }) },
    });
    const result = {
      calls: await run.toolCalls,
      finish: await run.finishReason,
      usage: await run.usage,
    };

    expect(sent.stream).toBe(true);
    expect(result.finish).toBe('tool-calls');
    expect(result.calls.map((c) => [c.toolName, c.input])).toEqual([
      ['notebook_search', { query: 'Bahn' }],
    ]);
    expect(result.usage.inputTokens).toBe(120);
    await vi.waitFor(() => expect(recordImpact).toHaveBeenCalledTimes(1));
    expect(recordImpact).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'melious', model: 'gemma-4-31b:balanced', userId: 'u1' })
    );
  });

  it('leaves a tool-less stream (the synth phase) streaming', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      sent = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
      return new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    }) as typeof fetch;
    await streamText({ model: model(), prompt: 'Hallo' }).text;
    expect(sent.stream).toBe(true);
  });
});
