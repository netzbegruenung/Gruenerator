/**
 * The verdigado proxy advertises two Gemma aliases: 'verdigado-think'
 * (gemma4:31b-ctx128k) and the legacy bare 'gemma' (gemma4:26b-ctx16k).
 * Grünerator asks for the 31B everywhere, so the 26B must not reach the
 * Playground / Vision pickers — otherwise a click silently drops the caller to
 * an eighth of the context window.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type * as EnvModule from '../../../config/env.js';
import type * as ProviderInstances from '../providerInstances.js';

vi.mock('../providerInstances.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ProviderInstances>()),
  isProviderConfigured: (p: string) => p === 'litellm',
}));

vi.mock('../../../config/env.js', async (importOriginal) => ({
  env: {
    ...(await importOriginal<typeof EnvModule>()).env,
    LITELLM_API_KEY: 'test-key',
    LITELLM_BASE_URL: 'https://litellm.test',
  },
}));

const PROXY_MODELS = [
  'verdigado-pro',
  'verdigado-think',
  'gemma',
  'verdigado-code',
  'nomic-embed-text',
];

describe('model discovery — legacy gemma alias', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: PROXY_MODELS.map((id) => ({ id })) }),
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('hides the bare gemma alias but keeps verdigado-think', async () => {
    const { getAvailableModels } = await import('../modelDiscovery.js');
    const ids = (await getAvailableModels(true)).map((m) => m.id);

    expect(ids).not.toContain('gemma');
    expect(ids).toContain('verdigado-think');
  });

  it('does not swallow the Regolo gemma4-31b via a broad pattern', async () => {
    const { getAvailableModels } = await import('../modelDiscovery.js');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [{ id: 'gemma4-31b' }, { id: 'gemma' }] }),
      }))
    );
    const ids = (await getAvailableModels(true)).map((m) => m.id);

    expect(ids).toContain('gemma4-31b');
    expect(ids).not.toContain('gemma');
  });

  it('keeps gemma metadata so a stored choice still reports its capabilities', async () => {
    const { isVisionCapable, isReasoningCapable } = await import('../modelDiscovery.js');

    expect(isVisionCapable('gemma')).toBe(true);
    expect(isReasoningCapable('gemma')).toBe(true);
  });
});
