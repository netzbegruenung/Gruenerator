import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What the two lanes are made of. The models come from the app's own provider
 * instances, so the transport (host, key, reasoning pin, Cortecs sovereignty
 * policy) is theirs and tested there; what is pinned here is the choice per
 * role and the tool-call batching.
 */

const mistralModel = vi.fn((id: string) => ({ provider: 'mistral', id }));
const cortecsChat = vi.fn((id: string) => ({ provider: 'cortecs', id }));
const getCortecsProvider = vi.fn(() => ({ chat: cortecsChat }));

vi.mock('../../ai/providerInstances.js', () => ({
  getMistralChatModel: (id: string) => mistralModel(id),
  getCortecsProvider: () => getCortecsProvider(),
}));

const env: Record<string, string | undefined> = { MISTRAL_API_KEY: 'k' };
vi.mock('../../../config/env.js', () => ({ env }));

const { leadModel, workerModel } = await import('./models.js');

beforeEach(() => {
  vi.clearAllMocks();
  env.MISTRAL_API_KEY = 'k';
});

describe('leadModel', () => {
  it('batches tool calls, so several sub-questions can be delegated at once', () => {
    expect(leadModel().providerOptions).toEqual({ mistral: { parallelToolCalls: true } });
  });

  it('runs the lane whose tool-calling discipline the run depends on', () => {
    leadModel();
    // Medium 3.5 → Large 4 on 12.10.2026; the reasoning pin for it sits in
    // getMistralChatModel, which every Mistral call of the app goes through.
    expect(mistralModel).toHaveBeenCalledWith('mistral-large-4');
  });

  it('names the key the lead actually needs', () => {
    env.MISTRAL_API_KEY = undefined;
    expect(() => leadModel()).toThrow(/MISTRAL_API_KEY/);
  });
});

describe('workerModel', () => {
  it('is a genuinely different, smaller lane than the lead', () => {
    workerModel();
    expect(cortecsChat).toHaveBeenCalledWith('gemma-4-31b-it');
  });

  it('does not batch tool calls — a worker never delegates', () => {
    expect(workerModel().providerOptions).toEqual({ openai: { parallelToolCalls: false } });
  });

  it('lets the missing Cortecs key surface instead of failing inside a run', () => {
    getCortecsProvider.mockImplementationOnce(() => {
      throw new Error('CORTECS_API_KEY environment variable is required');
    });
    expect(() => workerModel()).toThrow(/CORTECS_API_KEY/);
  });
});
