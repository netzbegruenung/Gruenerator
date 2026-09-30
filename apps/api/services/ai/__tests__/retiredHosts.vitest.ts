import { describe, expect, it } from 'vitest';

import { GEMMA_31B_ON_CORTECS } from '../gemmaHosts.js';
import { CORTECS_SMALL_32 } from '../intermediateLanes.js';
import { retireLiteLLM } from '../litellmRetired.js';
import { normalizeProviderName } from '../providers.js';

describe('retireLiteLLM — F0 name of the switched-off Regolo host', () => {
  it('maps persisted regolo Gemma ids to the Cortecs copy', () => {
    expect(retireLiteLLM('regolo', 'gemma4-31b')).toEqual({
      provider: 'cortecs',
      model: GEMMA_31B_ON_CORTECS.model,
    });
  });

  it('maps the small regolo models to the small intermediate model', () => {
    for (const model of ['mistral-small-4-119b', 'gpt-oss-120b']) {
      expect(retireLiteLLM('regolo', model)).toEqual({
        provider: 'cortecs',
        model: CORTECS_SMALL_32.model,
      });
    }
  });

  it('never passes an unknown or missing regolo model name through to Cortecs', () => {
    for (const model of ['qwen3.5-122b', 'something-else', null, undefined]) {
      expect(retireLiteLLM('regolo', model)).toEqual({
        provider: 'cortecs',
        model: GEMMA_31B_ON_CORTECS.model,
      });
    }
  });

  it('leaves live providers untouched', () => {
    expect(retireLiteLLM('melious', 'gemma-4-31b:balanced')).toEqual({
      provider: 'melious',
      model: 'gemma-4-31b:balanced',
    });
  });

  it('normalizes the provider name regolo to cortecs instead of failing', () => {
    expect(normalizeProviderName('regolo')).toBe('cortecs');
  });
});
