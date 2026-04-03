import { describe, it, expect } from 'vitest';

import { AVAILABLE_MODELS, getContextWindow, getModelConfig } from './providers.js';

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
    expect(getContextWindow('litellm')).toBe(16384);
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

  it('prefers model lookup over provider fallback', () => {
    expect(getContextWindow('litellm', 'mistral')).toBe(16384);
  });
});

describe('getModelConfig', () => {
  it('returns config with contextWindow for known models', () => {
    const config = getModelConfig('litellm');
    expect(config).not.toBeNull();
    expect(config!.contextWindow).toBe(16384);
    expect(config!.provider).toBe('litellm');
  });

  it('returns null for unknown model', () => {
    expect(getModelConfig('nonexistent')).toBeNull();
  });
});
