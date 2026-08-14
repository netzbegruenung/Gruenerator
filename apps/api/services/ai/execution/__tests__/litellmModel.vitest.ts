/**
 * Which model the litellm adapter actually asks for.
 *
 * It used to hardcode `verdigado-pro` and never read `options.model` — so the
 * model `providerSelector` computed was discarded for the largest lane, and the
 * 22 call sites that pass a model were talking to nobody whenever they landed
 * on litellm. The two that named a non-default model (`SearchGraph`'s
 * queryPlanner and suggestFollowUps, both `mistral-small`) were in fact kept
 * alive BY the hardcode: `mistral-small` is not a verdigado alias, so honouring
 * it without first pinning those call sites would have sent an unservable id to
 * the gateway. Both halves therefore land in one commit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateText = vi.fn();
const getModel = vi.fn((provider: string, model: string) => ({ provider, modelId: model }));

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateText(...args),
  jsonSchema: (s: unknown) => s,
}));
vi.mock('../../providers.js', () => ({
  getModel: (...args: unknown[]) => getModel(...(args as [string, string])),
  isProviderConfigured: vi.fn(() => true),
  getDefaultModel: vi.fn(() => 'verdigado-pro'),
}));
vi.mock('../../../tools/index.js', () => ({
  default: { prepareToolsPayload: vi.fn(() => ({})) },
}));

const { execute } = await import('../execute.js');

function request(options: Record<string, unknown> = {}) {
  return {
    type: 'chat',
    messages: [{ role: 'user' as const, content: 'Hallo' }],
    options,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  generateText.mockResolvedValue({ text: 'Antwort', finishReason: 'stop' });
});

describe('litellmAdapter — model selection', () => {
  it('uses the model the caller asked for', async () => {
    await execute('litellm', 'req', request({ model: 'verdigado-think' }) as never);
    expect(getModel).toHaveBeenCalledWith('litellm', 'verdigado-think');
  });

  it('falls back to the provider default when no model is named', async () => {
    await execute('litellm', 'req', request() as never);
    expect(getModel).toHaveBeenCalledWith('litellm', 'verdigado-pro');
  });

  it('reports the model it used in the response metadata', async () => {
    // The metadata used to say `verdigado-pro` no matter what ran, so nothing
    // downstream — logs, usage attribution, debugging — could see the truth.
    const result = await execute('litellm', 'req', request({ model: 'verdigado-think' }) as never);
    expect((result as { metadata?: { model?: string } }).metadata?.model).toBe('verdigado-think');
  });
});
