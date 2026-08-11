import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * These pin two decisions that are invisible at runtime until a fifteen-minute
 * run has already gone wrong, and that used to be reachable from the
 * environment — where a deployment could pick a lane nobody measured.
 *
 * 1. The lead batches its tool calls, the worker does not. Serial delegation is
 *    what made a full run outlast its own deadline: one `task` per turn runs the
 *    subagents one after another, so the run costs the SUM of the sub-questions
 *    instead of the slowest one.
 * 2. The worker runs a small model with reasoning switched off. Both halves
 *    matter: the cheap lane is the point, and GreenPT's Gemma — the intended
 *    worker before this — was dropped precisely because no flag stops it
 *    thinking, which is affordable once and ruinous in a loop.
 */

interface CapturedConfig {
  model: string;
  modelKwargs?: Record<string, unknown>;
  configuration?: { baseURL?: string };
  apiKey?: string;
}

const constructed: CapturedConfig[] = [];

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    constructor(config: CapturedConfig) {
      constructed.push(config);
    }
  },
}));

vi.mock('../../ai/scalewayEndpoint.js', () => ({
  scalewayBaseUrl: () => 'https://scaleway.example/v1',
}));

const envMock: { SCALEWAY_API_KEY?: string } = { SCALEWAY_API_KEY: 'test-key' };
vi.mock('../../../config/env.js', () => ({
  get env() {
    return envMock;
  },
}));

const { leadModel, workerModel } = await import('./models.js');

beforeEach(() => {
  constructed.length = 0;
  envMock.SCALEWAY_API_KEY = 'test-key';
});

function configOf(build: () => unknown): CapturedConfig {
  build();
  const config = constructed.at(-1);
  if (!config) throw new Error('no model was constructed');
  return config;
}

describe('leadModel', () => {
  it('batches tool calls, so several sub-questions can be delegated at once', () => {
    expect(configOf(leadModel).modelKwargs).toMatchObject({ parallel_tool_calls: true });
  });

  it('runs the lane whose tool-calling discipline the run depends on', () => {
    // A lead that fumbles `task` or `write_file` produces no document at all.
    expect(configOf(leadModel).model).toBe('mistral-medium-3.5-128b');
  });
});

describe('workerModel', () => {
  /**
   * The regression this exists for: `workerModel` used to return `leadModel()`
   * verbatim unless an env var named GreenPT — so in practice both roles ran
   * Mistral Medium and there was no cheap lane at all, only the appearance of
   * one. The worker makes the overwhelming majority of a run's model calls.
   */
  it('is a genuinely different, smaller lane than the lead', () => {
    const worker = configOf(workerModel);
    const lead = configOf(leadModel);
    expect(worker.model).not.toBe(lead.model);
    expect(worker.model).toBe('gemma-4-26b-a4b-it');
  });

  it('switches reasoning off — the property that decided the host', () => {
    // GreenPT accepts `reasoning_effort` and ignores it (~5,400 characters of
    // thinking per step); Scaleway honours it. That asymmetry, not price, is
    // why the worker sits here.
    expect(configOf(workerModel).modelKwargs).toMatchObject({ reasoning_effort: 'none' });
  });

  it('does not batch tool calls — a worker never delegates', () => {
    expect(configOf(workerModel).modelKwargs).toMatchObject({ parallel_tool_calls: false });
  });

  it('stays on the same host as the lead', () => {
    expect(configOf(workerModel).configuration?.baseURL).toBe(
      configOf(leadModel).configuration?.baseURL
    );
  });
});

describe('configuration faults', () => {
  it('names the missing key instead of failing somewhere inside a run', () => {
    delete envMock.SCALEWAY_API_KEY;
    expect(() => leadModel()).toThrow(/SCALEWAY_API_KEY/);
    expect(() => workerModel()).toThrow(/SCALEWAY_API_KEY/);
  });
});
