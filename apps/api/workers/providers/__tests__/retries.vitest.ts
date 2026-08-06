/**
 * How many attempts each provider gets before execute() gives up.
 *
 * GreenPT's thinking lanes (gemma4 et al.) ignore `think: false` and keep
 * reasoning internally until the gateway times out (services/ai/greenptThinkingFetch.ts).
 * Retrying that identical request rarely helps, so greenpt gets one retry
 * instead of two — every other provider keeps the SDK default.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateText = vi.fn();

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateText(...args),
  jsonSchema: (s: unknown) => s,
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
type Provider = (typeof PROVIDERS)[number];
const run = (provider: Provider) =>
  execute(provider, 'req', {
    type: 'chat',
    messages: [{ role: 'user' as const, content: 'Hallo' }],
    options: {},
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  generateText.mockResolvedValue({ text: 'Antwort', finishReason: 'stop' });
});

describe('execute() maxRetries per provider', () => {
  it('greenpt gets 1 retry instead of the default 2', async () => {
    await run('greenpt');
    expect(generateText.mock.calls[0][0]).toMatchObject({ maxRetries: 1 });
  });

  for (const name of PROVIDERS.filter((p) => p !== 'greenpt')) {
    it(`${name} keeps the default 2 retries`, async () => {
      await run(name);
      expect(generateText.mock.calls[0][0]).toMatchObject({ maxRetries: 2 });
    });
  }
});
