import { describe, it, expect } from 'vitest';

import {
  AVAILABLE_MODELS,
  getContextWindow,
  loopSynthChoice,
  getModelConfig,
  loopPlannerModelName,
  prefersUnifiedLoop,
} from './providers.js';

const WRITER_MODELS = new Set(['gemma4-31b', 'verdigado-pro']);

describe('prefersUnifiedLoop (unified vs planner/executor split)', () => {
  it('Mistral (fast native tool-caller) runs the unified single-model loop', () => {
    expect(prefersUnifiedLoop('mistral', 'mistral-medium-2604')).toBe(true);
  });
  it('every other provider runs the split (planner does tools, selection writes)', () => {
    expect(prefersUnifiedLoop('litellm', 'verdigado-think')).toBe(false);
    expect(prefersUnifiedLoop('litellm', 'verdigado-pro')).toBe(false);
    expect(prefersUnifiedLoop('regolo', 'gemma4-31b')).toBe(false);
    expect(prefersUnifiedLoop('regolo', 'gpt-oss-120b')).toBe(false);
    expect(prefersUnifiedLoop('regolo', 'qwen3.5-122b')).toBe(false);
  });
});

describe('split-mode model policy (getLoopSynthModel / loopPlannerModelName)', () => {
  it('planner is a verified NON-Chinese tool-caller', () => {
    // Native Mistral Small (fast tool-caller) when configured, else
    // litellm/verdigado-pro. Never qwen (Chinese), gpt-oss (tool-call fail) or a
    // think model.
    const planner = loopPlannerModelName();
    expect(['verdigado-pro', 'mistral-small-latest', 'mistral-medium-2604']).toContain(planner);
  });

  it('auto selection writes with the best writer, NEVER a think model', () => {
    const choice = loopSynthChoice('verdigado-think', true);
    expect(choice.provider).not.toBeNull();
    expect(WRITER_MODELS.has(choice.model)).toBe(true);
    expect(choice.model).not.toBe('verdigado-think');
  });

  it('a think-lane selection is ALSO rewritten to a fast writer (latency fix)', () => {
    // The user picking the gemma-4 lane resolves to verdigado-think as primary;
    // synthesis must not run on the reasoning model even though it isn't "auto".
    const choice = loopSynthChoice('verdigado-think', false);
    expect(choice.provider).not.toBeNull();
    expect(choice.model).not.toBe('verdigado-think');
    expect(WRITER_MODELS.has(choice.model)).toBe(true);
  });

  it('an explicit fast model selection is honored verbatim (no swap)', () => {
    const choice = loopSynthChoice('verdigado-pro', false);
    expect(choice.provider).toBeNull();
    expect(choice.model).toBe('verdigado-pro');
  });

  it('never routes a Chinese model into the synth slot', () => {
    for (const isAuto of [true, false]) {
      expect(loopSynthChoice('qwen3.5-122b', isAuto).model).not.toMatch(/qwen/);
    }
  });
});

describe('AVAILABLE_MODELS', () => {
  it('all entries have contextWindow field', () => {
    for (const [id, config] of Object.entries(AVAILABLE_MODELS)) {
      expect(config.contextWindow, `${id} missing contextWindow`).toBeGreaterThan(0);
    }
  });
});

describe('getContextWindow', () => {
  it('returns correct context window for known models', () => {
    expect(getContextWindow('mistral-large')).toBe(128000);
    expect(getContextWindow('gpt-oss')).toBe(32768);
    expect(getContextWindow('gemma-4')).toBe(32768);
    expect(getContextWindow('regolo')).toBe(32768);
  });

  it('returns default for unknown model', () => {
    expect(getContextWindow('nonexistent-model')).toBe(32768);
  });

  it('returns default for null/undefined model', () => {
    expect(getContextWindow(null)).toBe(32768);
    expect(getContextWindow(undefined)).toBe(32768);
  });

  it('uses provider fallback when model is unknown', () => {
    expect(getContextWindow('auto', 'mistral')).toBe(128000);
    expect(getContextWindow('auto', 'litellm')).toBe(16384);
    expect(getContextWindow('auto', 'regolo')).toBe(32768);
  });

  it('legacy litellm ID resolves to overflow lane window', () => {
    expect(getContextWindow('litellm', 'mistral')).toBe(32768);
  });
});

describe('getModelConfig', () => {
  it('returns single config for pinned models', () => {
    const config = getModelConfig('mistral-large');
    expect(config).not.toBeNull();
    expect(config!.kind).toBe('single');
    if (config!.kind === 'single') {
      expect(config.provider).toBe('mistral');
      expect(config.contextWindow).toBe(128000);
    }
  });

  it('returns overflow config for the gpt-oss lane', () => {
    const config = getModelConfig('gpt-oss');
    expect(config).not.toBeNull();
    expect(config!.kind).toBe('overflow');
    if (config!.kind === 'overflow') {
      expect(config.primary.provider).toBe('litellm');
      expect(config.overflow.provider).toBe('regolo');
      expect(config.contextWindow).toBe(32768);
    }
  });

  it('aliases legacy IDs to the new overflow lanes', () => {
    expect(getModelConfig('litellm')).toBe(getModelConfig('gpt-oss'));
    expect(getModelConfig('gpt-oss-regolo')).toBe(getModelConfig('gpt-oss'));
    expect(getModelConfig('gemma-litellm')).toBe(getModelConfig('gemma-4'));
    expect(getModelConfig('gemma-regolo')).toBe(getModelConfig('gemma-4'));
  });

  it('returns null for unknown model', () => {
    expect(getModelConfig('nonexistent')).toBeNull();
  });
});
