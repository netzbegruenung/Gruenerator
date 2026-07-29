/**
 * What an adapter does when the model returns nothing.
 *
 * litellm alone THREW; the other three returned empty content. Both land in
 * `executeFallback`, so the outcome looked the same — but the throw discarded
 * `metadata.usage`, so the tokens a truncated answer had already burned went
 * unrecorded, and the `finish_reason=length` diagnostic existed only on the one
 * provider that needed it least. Reasoning models (gpt-oss, the GreenPT
 * thinking lanes) bill their chain of thought against `max_tokens` and can
 * exhaust it before writing a word — without that log it reads as "the model
 * returned nothing".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateText = vi.fn();

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateText(...args),
  jsonSchema: (s: unknown) => s,
}));
vi.mock('../../../services/ai/providers.js', () => ({
  getModel: vi.fn(() => ({ modelId: 'm' })),
  isProviderConfigured: vi.fn(() => true),
  getDefaultModel: vi.fn(() => 'verdigado-pro'),
}));
vi.mock('../../../services/tools/index.js', () => ({
  default: { prepareToolsPayload: vi.fn(() => ({})) },
}));

const { execute: mistral } = await import('../mistralAdapter.js');
const { execute: litellm } = await import('../litellmAdapter.js');
const { execute: regolo } = await import('../regoloAdapter.js');
const { execute: greenpt } = await import('../greenptAdapter.js');

type Execute = (requestId: string, data: never) => Promise<unknown>;
const ADAPTERS: Array<[string, Execute]> = [
  ['mistral', mistral as Execute],
  ['litellm', litellm as Execute],
  ['regolo', regolo as Execute],
  ['greenpt', greenpt as Execute],
];

const request = { type: 'chat', messages: [{ role: 'user' as const, content: 'Hallo' }] };

beforeEach(() => vi.clearAllMocks());

describe('an exhausted output budget', () => {
  for (const [name, execute] of ADAPTERS) {
    it(`${name} returns the empty answer instead of throwing`, async () => {
      generateText.mockResolvedValue({
        text: '',
        finishReason: 'length',
        usage: { inputTokens: 900, outputTokens: 4096, totalTokens: 4996 },
      });

      const result = (await execute('req', request as never)) as {
        content: string | null;
        success: boolean;
        raw_content_blocks?: unknown;
        metadata?: { usage?: { total_tokens?: number } };
      };

      expect(result.content).toBeNull();
      expect(result.success).toBe(true);
      // The point of not throwing: the burned tokens stay attributable.
      expect(result.metadata?.usage?.total_tokens).toBe(4996);
      expect(result.raw_content_blocks).toBeUndefined();
    });

    it(`${name} logs the finish_reason=length diagnostic`, async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      generateText.mockResolvedValue({ text: '', finishReason: 'length', usage: {} });

      await execute('req', request as never);

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('finish_reason=length'));
      warn.mockRestore();
    });
  }
});

describe('a normal answer is unaffected', () => {
  for (const [name, execute] of ADAPTERS) {
    it(`${name} returns text and a text block`, async () => {
      generateText.mockResolvedValue({ text: 'Antwort', finishReason: 'stop' });

      const result = (await execute('req', request as never)) as {
        content: string | null;
        stop_reason?: string;
        raw_content_blocks?: Array<{ type: string; text?: string }>;
      };

      expect(result.content).toBe('Antwort');
      expect(result.stop_reason).toBe('stop');
      expect(result.raw_content_blocks).toEqual([{ type: 'text', text: 'Antwort' }]);
    });
  }
});
