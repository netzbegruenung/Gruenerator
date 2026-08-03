/**
 * `options.response_format` was declared in `AIRequestOptions` and read by no
 * adapter. Eight call sites set `{type:'json_object'}` — the chat classifier
 * (twice), the compute node, the compute verifier, the pandas compute node, the
 * quality gate, query expansion, the board agent worker — and every one of them
 * believed it was getting constrained decoding while really just asking nicely
 * in the prompt.
 *
 * They all parse defensively, so nothing was visibly broken; what was broken is
 * that a stated requirement had no effect, and the comment in
 * `pandasComputeNode` explaining WHICH providers honoured it described
 * behaviour that never existed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateText = vi.fn();
const wrapLanguageModel = vi.fn((args: { model: unknown }) => ({ wrapped: args.model }));
const defaultSettingsMiddleware = vi.fn((args: unknown) => args);

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateText(...args),
  jsonSchema: (s: unknown) => s,
  wrapLanguageModel: (...args: [{ model: unknown }]) => wrapLanguageModel(...args),
  defaultSettingsMiddleware: (...args: unknown[]) => defaultSettingsMiddleware(...args),
}));
vi.mock('../../../services/ai/providers.js', () => ({
  getModel: vi.fn((provider: string, model: string) => ({ provider, modelId: model })),
  isProviderConfigured: vi.fn(() => true),
  getDefaultModel: vi.fn(() => 'default-model'),
}));
vi.mock('../../../services/tools/index.js', () => ({
  default: { prepareToolsPayload: vi.fn(() => ({})) },
}));

const { execute } = await import('../execute.js');

const PROVIDERS = ['mistral', 'litellm', 'regolo', 'greenpt'] as const;

function request(options: Record<string, unknown> = {}) {
  return { type: 'chat', messages: [{ role: 'user' as const, content: 'Hallo' }], options };
}

beforeEach(() => {
  vi.clearAllMocks();
  generateText.mockResolvedValue({ text: '{}', finishReason: 'stop' });
});

describe('response_format: json_object', () => {
  for (const provider of PROVIDERS) {
    it(`${provider} asks the model for JSON`, async () => {
      await execute(
        provider,
        'req',
        request({
          response_format: { type: 'json_object' },
        }) as never
      );

      expect(defaultSettingsMiddleware).toHaveBeenCalledWith({
        settings: { responseFormat: { type: 'json' } },
      });
      expect(wrapLanguageModel).toHaveBeenCalled();
    });
  }

  it('leaves the model alone when no format was requested', async () => {
    await execute('mistral', 'req', request() as never);
    expect(wrapLanguageModel).not.toHaveBeenCalled();
  });

  it('ignores a format it does not know', async () => {
    await execute('mistral', 'req', request({ response_format: { type: 'text' } }) as never);
    expect(wrapLanguageModel).not.toHaveBeenCalled();
  });

  it('wraps the usage-tracked model rather than the other way round', async () => {
    // getModel already wraps for token accounting; wrapping the other way round
    // would put the format middleware between the accountant and the model.
    await execute(
      'mistral',
      'req',
      request({
        response_format: { type: 'json_object' },
      }) as never
    );

    expect(wrapLanguageModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: { provider: 'mistral', modelId: 'default-model' } })
    );
  });
});
