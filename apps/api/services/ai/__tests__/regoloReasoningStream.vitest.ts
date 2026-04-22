import { describe, it, expect } from 'vitest';

import { isRegoloReasoningModel, streamRegoloWithReasoning } from '../regoloReasoningStream.js';

describe('isRegoloReasoningModel', () => {
  it('returns true for qwen3.5-122b on regolo', () => {
    expect(isRegoloReasoningModel('regolo', 'qwen3.5-122b')).toBe(true);
  });

  it('returns true for gpt-oss-120b on regolo', () => {
    expect(isRegoloReasoningModel('regolo', 'gpt-oss-120b')).toBe(true);
  });

  it('returns false for gemma4-31b (not a reasoning model)', () => {
    expect(isRegoloReasoningModel('regolo', 'gemma4-31b')).toBe(false);
  });

  it('returns false for qwen on litellm (different provider)', () => {
    expect(isRegoloReasoningModel('litellm', 'qwen3.5-122b')).toBe(false);
  });
});

describe.skipIf(!process.env.REGOLO_API_KEY)('streamRegoloWithReasoning — live integration', () => {
  it('yields both reasoning and text chunks from qwen3.5-122b', async () => {
    const chunks: Array<{ type: 'text' | 'reasoning'; delta: string }> = [];

    for await (const chunk of streamRegoloWithReasoning({
      model: 'qwen3.5-122b',
      messages: [
        {
          role: 'system',
          content: 'Answer in at most 3 words. Do not explain.',
        },
        { role: 'user', content: 'Say only "Hallo"' },
      ],
      maxTokens: 2000,
      temperature: 0,
    })) {
      chunks.push(chunk);
      if (chunks.length > 500) break; // safety
    }

    const textChunks = chunks.filter((c) => c.type === 'text');
    const reasoningChunks = chunks.filter((c) => c.type === 'reasoning');

    expect(reasoningChunks.length).toBeGreaterThan(0);
    expect(textChunks.length).toBeGreaterThan(0);

    const fullText = textChunks.map((c) => c.delta).join('');
    expect(fullText.toLowerCase()).toContain('hallo');
  }, 30_000);

  it('throws a useful error on unknown model', async () => {
    const run = async (): Promise<void> => {
      for await (const _chunk of streamRegoloWithReasoning({
        model: 'this-model-does-not-exist',
        messages: [{ role: 'user', content: 'x' }],
        maxTokens: 10,
        temperature: 0,
      })) {
        void _chunk;
      }
    };
    await expect(run()).rejects.toThrow(/Regolo stream failed/);
  }, 15_000);
});
