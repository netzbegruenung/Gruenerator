import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { regoloFetchWithThinkingDisabled } from '../regoloThinkingFetch.js';

describe('regoloFetchWithThinkingDisabled — body transformation', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('injects chat_template_kwargs.enable_thinking=false into chat completion bodies', async () => {
    await regoloFetchWithThinkingDisabled('https://api.regolo.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3.5-122b',
        messages: [{ role: 'user', content: 'Hallo' }],
      }),
    });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(sentBody.model).toBe('qwen3.5-122b');
    expect(sentBody.messages).toHaveLength(1);
  });

  it('preserves existing chat_template_kwargs fields', async () => {
    await regoloFetchWithThinkingDisabled('https://api.regolo.ai/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'qwen3.5-122b',
        messages: [{ role: 'user', content: 'x' }],
        chat_template_kwargs: { some_other_flag: true },
      }),
    });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.chat_template_kwargs).toEqual({
      some_other_flag: true,
      enable_thinking: false,
    });
  });

  it('does not mutate the caller-supplied init object', async () => {
    const init: RequestInit = {
      method: 'POST',
      body: JSON.stringify({
        model: 'qwen3.5-122b',
        messages: [{ role: 'user', content: 'Hallo' }],
      }),
    };
    const originalBody = init.body;

    await regoloFetchWithThinkingDisabled('https://api.regolo.ai/v1/chat/completions', init);

    expect(init.body).toBe(originalBody);
  });

  it('passes non-chat endpoints (no messages field) through unchanged', async () => {
    await regoloFetchWithThinkingDisabled('https://api.regolo.ai/v1/embeddings', {
      method: 'POST',
      body: JSON.stringify({ model: 'Qwen3-Embedding-8B', input: 'text' }),
    });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.chat_template_kwargs).toBeUndefined();
  });

  it('passes non-JSON bodies through unchanged', async () => {
    const form = new FormData();
    form.append('file', new Blob(['data']));

    await regoloFetchWithThinkingDisabled('https://api.regolo.ai/v1/audio/transcriptions', {
      method: 'POST',
      body: form,
    });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init as RequestInit).body).toBe(form);
  });

  it('passes GET requests (no body) through unchanged', async () => {
    await regoloFetchWithThinkingDisabled('https://api.regolo.ai/v1/models', { method: 'GET' });

    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});

describe.skipIf(!process.env.REGOLO_API_KEY)(
  'regoloFetchWithThinkingDisabled — live Regolo integration',
  () => {
    const apiKey = process.env.REGOLO_API_KEY!;

    async function callQwen(body: Record<string, unknown>): Promise<{
      content: string | null;
      reasoning: string | null;
      finish: string | undefined;
    }> {
      const res = await fetch('https://api.regolo.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        choices?: Array<{
          message?: { content?: string | null; reasoning_content?: string | null };
          finish_reason?: string;
        }>;
      };
      const msg = json.choices?.[0]?.message ?? {};
      return {
        content: msg.content ?? null,
        reasoning: msg.reasoning_content ?? null,
        finish: json.choices?.[0]?.finish_reason,
      };
    }

    it('without wrapper: Qwen3.5-122b emits reasoning_content and empty content', async () => {
      const { content, reasoning, finish } = await callQwen({
        model: 'qwen3.5-122b',
        messages: [{ role: 'user', content: 'Sag nur Hallo' }],
        max_tokens: 150,
      });

      expect(reasoning ?? '').not.toBe('');
      expect(content ?? '').toBe('');
      expect(finish).toBe('length');
    }, 30_000);

    it('with chat_template_kwargs.enable_thinking=false: Qwen emits content directly', async () => {
      const baseInit: RequestInit = {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen3.5-122b',
          messages: [{ role: 'user', content: 'Sag nur Hallo' }],
          max_tokens: 150,
        }),
      };

      const res = await regoloFetchWithThinkingDisabled(
        'https://api.regolo.ai/v1/chat/completions',
        baseInit
      );
      const json = (await res.json()) as {
        choices?: Array<{
          message?: { content?: string | null; reasoning_content?: string | null };
          finish_reason?: string;
        }>;
      };
      const msg = json.choices?.[0]?.message ?? {};

      expect(msg.content ?? '').not.toBe('');
      expect(msg.content?.toLowerCase()).toContain('hallo');
      expect(json.choices?.[0]?.finish_reason).toBe('stop');
    }, 30_000);
  }
);
