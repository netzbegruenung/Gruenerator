import { describe, it, expect, beforeAll } from 'vitest';

import {
  isProviderConfigured,
  getDefaultModel,
  getProviderDisplayName,
  normalizeProviderName,
  getModel,
} from '../../../services/ai/providers.js';
import { determineProviderFromModel } from '../../../services/providers/providerSelector.js';
import { isProviderAvailable } from '../../../services/providers/providerFallback.js';
import { adapters, executeProvider } from '../index.js';

describe('Regolo provider — unit tests', () => {
  it('adapters record includes regolo with execute function', () => {
    expect(adapters['regolo']).toBeDefined();
    expect(typeof adapters['regolo'].execute).toBe('function');
  });

  it('getDefaultModel returns expected default', () => {
    expect(getDefaultModel('regolo')).toBe(process.env.REGOLO_DEFAULT_MODEL || 'qwen3.5-122b');
  });

  it('getProviderDisplayName returns Regolo AI', () => {
    expect(getProviderDisplayName('regolo')).toBe('Regolo AI');
  });

  it('normalizeProviderName recognizes regolo', () => {
    expect(normalizeProviderName('regolo')).toBe('regolo');
    expect(normalizeProviderName('Regolo')).toBe('regolo');
    expect(normalizeProviderName('REGOLO')).toBe('regolo');
  });

  it('determineProviderFromModel detects regolo/ prefix', () => {
    expect(determineProviderFromModel('regolo/qwen3.5-122b')).toBe('regolo');
  });

  it('isProviderConfigured reflects REGOLO_API_KEY env var', () => {
    const hasKey = !!process.env.REGOLO_API_KEY;
    expect(isProviderConfigured('regolo')).toBe(hasKey);
  });

  it('isProviderAvailable reflects REGOLO_API_KEY env var', () => {
    const hasKey = !!process.env.REGOLO_API_KEY;
    expect(isProviderAvailable('regolo')).toBe(hasKey);
  });

  it('getModel creates a model instance when API key is set', () => {
    if (!process.env.REGOLO_API_KEY) {
      expect(() => getModel('regolo')).toThrow('REGOLO_API_KEY');
      return;
    }
    const model = getModel('regolo');
    expect(model).toBeDefined();
  });
});

describe.skipIf(!process.env.REGOLO_API_KEY)(
  'Regolo provider — integration tests (requires REGOLO_API_KEY)',
  () => {
    beforeAll(() => {
      expect(process.env.REGOLO_API_KEY).toBeTruthy();
    });

    it('chat completion with qwen3.5-122b (reasoning model, needs more tokens)', async () => {
      const result = await executeProvider('regolo', 'test-regolo-qwen', {
        messages: [{ role: 'user', content: 'Sag einfach nur "Hallo"' }],
        systemPrompt: 'Du antwortest immer kurz und prägnant. Maximal ein Wort.',
        type: 'chat',
        options: { max_tokens: 512, model: 'qwen3.5-122b' },
        metadata: {},
      });

      expect(result.success).toBe(true);
      expect(result.content).toBeTruthy();
      expect(result.metadata?.provider).toBe('regolo');
      expect(result.stop_reason).toBeDefined();
    }, 30000);

    it('chat completion with mistral-small-4-119b', async () => {
      const result = await executeProvider('regolo', 'test-regolo-mistral', {
        messages: [{ role: 'user', content: 'Sag einfach nur "Hallo"' }],
        systemPrompt: 'Du antwortest immer kurz und prägnant.',
        type: 'chat',
        options: { max_tokens: 50, model: 'mistral-small-4-119b' },
        metadata: {},
      });

      expect(result.success).toBe(true);
      expect(result.content).toBeTruthy();
      expect(result.metadata?.provider).toBe('regolo');
    }, 30000);

    it('chat completion with Llama-3.3-70B-Instruct', async () => {
      const result = await executeProvider('regolo', 'test-regolo-llama', {
        messages: [{ role: 'user', content: 'Sag einfach nur "Hallo"' }],
        systemPrompt: 'Du antwortest immer kurz und prägnant.',
        type: 'chat',
        options: { max_tokens: 50, model: 'Llama-3.3-70B-Instruct' },
        metadata: {},
      });

      expect(result.success).toBe(true);
      expect(result.content).toBeTruthy();
      expect(result.metadata?.provider).toBe('regolo');
    }, 30000);

    it('chat completion with gpt-oss-120b (reasoning model)', async () => {
      const result = await executeProvider('regolo', 'test-regolo-gptoss', {
        messages: [{ role: 'user', content: 'Sag einfach nur "Hallo"' }],
        systemPrompt: 'Du antwortest immer kurz und prägnant. Maximal ein Wort.',
        type: 'chat',
        options: { max_tokens: 512, model: 'gpt-oss-120b' },
        metadata: {},
      });

      expect(result.success).toBe(true);
      expect(result.content).toBeTruthy();
      expect(result.metadata?.provider).toBe('regolo');
    }, 30000);

    it('chat completion with mistral-small3.2', async () => {
      const result = await executeProvider('regolo', 'test-regolo-mistral32', {
        messages: [{ role: 'user', content: 'Sag einfach nur "Hallo"' }],
        systemPrompt: 'Du antwortest immer kurz und prägnant.',
        type: 'chat',
        options: { max_tokens: 50, model: 'mistral-small3.2' },
        metadata: {},
      });

      expect(result.success).toBe(true);
      expect(result.content).toBeTruthy();
      expect(result.metadata?.provider).toBe('regolo');
    }, 30000);
  }
);
