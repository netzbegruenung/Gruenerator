/**
 * Mistral Medium 3.5's thinking turns on Scaleway.
 *
 * Before this lane existed, every thinking turn left Scaleway for the Mistral
 * API — the one upstream the rest of the lane deliberately avoids. It did so
 * because `@ai-sdk/openai` cannot read the reasoning Scaleway sends. The raw
 * streamer can, so the carve-out is no longer needed for the chat path.
 *
 * What the tests pin down, measured against all three hosts on 2026-07-31:
 *   - Scaleway streams thinking as `delta.reasoning` (plain string) — the shape
 *     `extractDelta` already reads. The Mistral API streams `delta.content` as
 *     a block ARRAY this module cannot parse, which is why the fallback is the
 *     SDK path and never a raw replay.
 *   - The effort dial is BINARY on every host serving these weights: `low` and
 *     `medium` are rejected with a 400 (`supported values: ['none','high']`),
 *     so the lane must send `high` and never pass an effort through.
 *
 * The env is manipulated through `vi.resetModules()` + dynamic import because
 * `config/env.js` parses `process.env` once at import time — same reason and
 * same shape as scalewayRouting.vitest.ts.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

async function loadStream(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import('../regoloReasoningStream.js');
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

/** Captures the request the streamer builds, then ends the stream immediately. */
function captureFetch(): { calls: Array<{ url: string; body: Record<string, unknown> }> } {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    return new Response('data: [DONE]\n', { status: 200 });
  });
  return { calls };
}

describe('isReasoningStreamModel — Mistral lane', () => {
  it('claims every Medium 3.5 alias when Scaleway is configured', async () => {
    const { isReasoningStreamModel } = await loadStream({ SCALEWAY_API_KEY: 'scw-key' });

    // Same three ids routeMistralModel accepts. Missing one would send that
    // caller's thinking turn down the SDK path and off Scaleway in silence.
    for (const id of ['mistral-medium-2604', 'mistral-medium-3.5', 'mistral-medium-latest']) {
      expect(isReasoningStreamModel('mistral', id)).toBe(true);
    }
  });

  it('declines without a Scaleway key, leaving the lane on the Mistral API', async () => {
    const { isReasoningStreamModel } = await loadStream({ SCALEWAY_API_KEY: undefined });

    // The point of the guard: a deployment with no Scaleway key must keep the
    // previous behaviour rather than fail every thinking turn.
    expect(isReasoningStreamModel('mistral', 'mistral-medium-2604')).toBe(false);
  });

  it('declines Mistral models Scaleway does not serve', async () => {
    const { isReasoningStreamModel } = await loadStream({ SCALEWAY_API_KEY: 'scw-key' });

    // Pixtral and Small are not in this Scaleway project. Claiming them would
    // 404 every one of their thinking turns.
    expect(isReasoningStreamModel('mistral', 'pixtral-large-latest')).toBe(false);
    expect(isReasoningStreamModel('mistral', 'mistral-small-latest')).toBe(false);
  });
});

describe('streamWithReasoning — Mistral lane request shape', () => {
  it('posts to Scaleway under the id Scaleway knows the weights by', async () => {
    const { streamWithReasoning } = await loadStream({
      SCALEWAY_API_KEY: 'scw-key',
      SCALEWAY_BASE_URL: 'https://api.scaleway.ai/proj/v1',
    });
    const { calls } = captureFetch();

    for await (const _ of streamWithReasoning({
      provider: 'mistral',
      model: 'mistral-medium-2604',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0,
    }));

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.scaleway.ai/proj/v1/chat/completions');
    // The lane's own id would 404 on Scaleway — the mapping is the whole point.
    expect(calls[0]?.body.model).toBe('mistral-medium-3.5-128b');
  });

  it('sends reasoning_effort:high and never a low/medium effort', async () => {
    const { streamWithReasoning } = await loadStream({
      SCALEWAY_API_KEY: 'scw-key',
      SCALEWAY_BASE_URL: 'https://api.scaleway.ai/proj/v1',
    });
    const { calls } = captureFetch();

    // 'low' is a legitimate value for the OTHER reasoning lanes, so the risk is
    // real: passing it through here is a 400 from Scaleway, not a soft degrade.
    for await (const _ of streamWithReasoning({
      provider: 'mistral',
      model: 'mistral-medium-2604',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0,
      effort: 'low',
    }));

    expect(calls[0]?.body.reasoning_effort).toBe('high');
    // The chat-template flags belong to the vLLM/Ollama lanes; Mistral rejects
    // unknown template kwargs rather than ignoring them.
    expect(calls[0]?.body.chat_template_kwargs).toBeUndefined();
  });
});

describe('ReasoningStreamUnavailableError', () => {
  it('is thrown when the upstream never answered, so the caller may retry', async () => {
    const { streamWithReasoning, ReasoningStreamUnavailableError } = await loadStream({
      SCALEWAY_API_KEY: 'scw-key',
      SCALEWAY_BASE_URL: 'https://api.scaleway.ai/proj/v1',
    });
    vi.stubGlobal('fetch', async () => new Response('upstream down', { status: 503 }));

    const consume = async () => {
      for await (const _ of streamWithReasoning({
        provider: 'mistral',
        model: 'mistral-medium-2604',
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0,
      }));
    };

    // The distinct type is what lets streamForResolution tell "never served"
    // apart from "died mid-stream" — only the former is safe to retry, because
    // only it guarantees nothing reached the user's screen.
    await expect(consume()).rejects.toBeInstanceOf(ReasoningStreamUnavailableError);
    await expect(consume()).rejects.toMatchObject({ status: 503 });
  });

  it('does not mask a mid-stream failure as retryable', async () => {
    const { streamWithReasoning, ReasoningStreamUnavailableError } = await loadStream({
      SCALEWAY_API_KEY: 'scw-key',
      SCALEWAY_BASE_URL: 'https://api.scaleway.ai/proj/v1',
    });
    // The chunk and the failure must land in SEPARATE pulls: `controller.error()`
    // discards anything still queued, so erroring in the same tick would test a
    // stream that never delivered at all — the opposite of the case at hand.
    let pulls = 0;
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              if (pulls++ === 0) {
                controller.enqueue(
                  new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hal"}}]}\n')
                );
                return;
              }
              controller.error(new Error('connection reset'));
            },
          }),
          { status: 200 }
        )
    );

    const chunks: string[] = [];
    const consume = async () => {
      for await (const chunk of streamWithReasoning({
        provider: 'mistral',
        model: 'mistral-medium-2604',
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0,
      })) {
        chunks.push(chunk.delta);
      }
    };

    // Tokens already reached the user, so a retry would duplicate them. The
    // error must NOT carry the retryable type.
    await expect(consume()).rejects.not.toBeInstanceOf(ReasoningStreamUnavailableError);
    expect(chunks).toEqual(['Hal']);
  });
});

describe('extractDelta — the shape Scaleway actually streams', () => {
  it('reads Scaleway thinking from delta.reasoning', async () => {
    const { streamWithReasoning } = await loadStream({
      SCALEWAY_API_KEY: 'scw-key',
      SCALEWAY_BASE_URL: 'https://api.scaleway.ai/proj/v1',
    });
    // Verbatim shape captured from Scaleway on 2026-07-31. If Scaleway ever
    // switches to the Mistral API's block-array form, this test fails and the
    // parser needs the second shape before the lane can stay on Scaleway.
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n' +
            'data: {"choices":[{"delta":{"reasoning":"Okay"}}]}\n' +
            'data: {"choices":[{"delta":{"reasoning":", der"}}]}\n' +
            'data: {"choices":[{"delta":{"content":"120 km"}}]}\n' +
            'data: [DONE]\n',
          { status: 200 }
        )
    );

    const chunks: Array<{ type: string; delta: string }> = [];
    for await (const chunk of streamWithReasoning({
      provider: 'mistral',
      model: 'mistral-medium-2604',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0,
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'reasoning', delta: 'Okay' },
      { type: 'reasoning', delta: ', der' },
      { type: 'text', delta: '120 km' },
    ]);
  });
});
