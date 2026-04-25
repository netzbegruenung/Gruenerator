/**
 * Custom Regolo streamer that parses both `content` and `reasoning_content`
 * SSE deltas from the OpenAI-compatible chat completions endpoint.
 *
 * Why this exists: `@ai-sdk/openai@3.0.53` only bridges reasoning for the
 * OpenAI *Responses* API (`response.reasoning_summary_text.delta`). Regolo's
 * Qwen3 family uses Chat Completions with a vLLM-specific `reasoning_content`
 * field, which the SDK silently drops. To surface the model's thinking to
 * our UI (Reasoning/ReasoningGroup components), we bypass the AI SDK for
 * reasoning-capable Regolo models and parse the raw SSE stream ourselves.
 *
 * The wrapper disables the chat-template `enable_thinking: false` workaround
 * that we apply globally for non-reasoning consumers; here we explicitly want
 * thinking ON.
 */

import { env } from '../../config/env.js';

import type { ModelMessage } from 'ai';

export interface ReasoningStreamChunk {
  type: 'text' | 'reasoning';
  delta: string;
}

export interface RegoloReasoningStreamParams {
  model: string;
  messages: ModelMessage[];
  maxTokens: number;
  temperature: number;
  signal?: AbortSignal;
}

const REGOLO_ENDPOINT = 'https://api.regolo.ai/v1/chat/completions';

/**
 * Models on Regolo that emit `reasoning_content` by default (or when thinking
 * is enabled). These are the cases where we want to surface reasoning to the
 * frontend.
 */
const REGOLO_REASONING_MODELS = new Set(['qwen3.5-122b', 'qwen3.6-27b', 'gpt-oss-120b']);

export function isRegoloReasoningModel(provider: string, model: string): boolean {
  return provider === 'regolo' && REGOLO_REASONING_MODELS.has(model);
}

/**
 * Stream a chat completion from Regolo, yielding both text and reasoning
 * deltas as they arrive. Throws on non-2xx or aborted streams.
 */
export async function* streamRegoloWithReasoning(
  params: RegoloReasoningStreamParams
): AsyncGenerator<ReasoningStreamChunk, void, unknown> {
  const apiKey = env.REGOLO_API_KEY;
  if (!apiKey) {
    throw new Error('REGOLO_API_KEY is not configured');
  }

  const response = await fetch(REGOLO_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      stream: true,
      chat_template_kwargs: { enable_thinking: true },
    }),
    ...(params.signal && { signal: params.signal }),
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '');
    throw new Error(`Regolo stream failed: ${response.status} ${body.slice(0, 200)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let lineBreak: number;
      while ((lineBreak = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, lineBreak).trim();
        buffer = buffer.slice(lineBreak + 1);
        if (!line || !line.startsWith('data:')) continue;

        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;

        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        const delta = extractDelta(parsed);
        if (delta.reasoning) yield { type: 'reasoning', delta: delta.reasoning };
        if (delta.text) yield { type: 'text', delta: delta.text };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function extractDelta(chunk: unknown): { text: string; reasoning: string } {
  const choices = (chunk as { choices?: Array<{ delta?: Record<string, unknown> }> }).choices;
  const delta = choices?.[0]?.delta ?? {};
  const text = typeof delta.content === 'string' ? delta.content : '';
  const reasoning = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
  return { text, reasoning };
}
