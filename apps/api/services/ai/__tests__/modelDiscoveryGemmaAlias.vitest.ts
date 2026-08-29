/**
 * `EXCLUDE_IDS` filtert die Kennung `gemma` exakt und nicht per Muster.
 *
 * Sie stammt vom Verdigado-Proxy, der sie auf `gemma4:26b-ctx16k` auflöste —
 * ein Achtel Kontext gegenüber dem 31B, das der Grünerator überall anfragt. Der
 * Proxy wird seit dem 29.08.2026 gar nicht mehr befragt
 * (services/ai/litellmRetired.ts), die Regel bleibt aber die interessante: ein
 * `/gemma/i`-Muster hätte Regolos `gemma4-31b` mitgenommen, und DAS ist ein
 * Modell, das die Auswahl anbieten soll. Deshalb prüft dieser Test jetzt gegen
 * Regolos Katalog statt gegen den des Proxys.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type * as EnvModule from '../../../config/env.js';
import type * as ProviderInstances from '../providerInstances.js';

vi.mock('../providerInstances.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ProviderInstances>()),
  isProviderConfigured: (p: string) => p === 'regolo',
}));

vi.mock('../../../config/env.js', async (importOriginal) => ({
  env: {
    ...(await importOriginal<typeof EnvModule>()).env,
    REGOLO_API_KEY: 'test-key',
  },
}));

describe('model discovery — legacy gemma alias', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [{ id: 'gemma4-31b' }, { id: 'gemma' }, { id: 'nomic-embed-text' }],
        }),
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('does not swallow gemma4-31b via a broad pattern', async () => {
    const { getAvailableModels } = await import('../modelDiscovery.js');
    const ids = (await getAvailableModels(true)).map((m) => m.id);

    expect(ids).toContain('gemma4-31b');
    expect(ids).not.toContain('gemma');
  });

  it('keeps gemma metadata so a stored choice still reports its capabilities', async () => {
    const { isVisionCapable, isReasoningCapable } = await import('../modelDiscovery.js');

    expect(isVisionCapable('gemma')).toBe(true);
    expect(isReasoningCapable('gemma')).toBe(true);
  });

  it('no longer offers the retired verdigado aliases', async () => {
    const { getAvailableModels } = await import('../modelDiscovery.js');
    const ids = (await getAvailableModels(true)).map((m) => m.id);

    expect(ids).not.toContain('verdigado-pro');
    expect(ids).not.toContain('verdigado-think');
  });
});
