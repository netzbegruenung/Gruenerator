/**
 * Welchen Host der Monitor benutzt — und welchen NICHT.
 *
 * Der Monitor lief bis 19.08.2026 auf litellm/verdigado-pro. Verdigado hat
 * einen einzigen Inferenz-Slot, und derselbe Host war zugleich der Ausweg der
 * Chat-Gemma-Lane: ein stündlicher Hintergrundlauf konnte damit einem
 * wartenden Menschen den Ausweichhost wegnehmen. Diese Fälle halten fest, dass
 * der Monitor dort nicht mehr landet — und dass er nicht auf GreenPTs Gemma
 * landet, das immer denkt und bei den gedeckelten Aufrufen leeren Text liefert.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const isProviderConfigured = vi.fn<(p: string) => boolean>();

vi.mock('../providerInstances.js', () => ({
  isProviderConfigured: (p: string) => isProviderConfigured(p),
  // Jeder Client gibt ein durchsichtiges Modell zurück, das sich merkt, wer es
  // gebaut hat — mehr braucht die Frage „welcher Host" nicht.
  getMistralProvider: () => (model: string) => ({ provider: 'mistral', modelId: model }),
  getLiteLLMProvider: () => ({
    chat: (model: string) => ({ provider: 'litellm', modelId: model }),
  }),
  getRegoloProvider: () => ({
    chat: (model: string) => ({ provider: 'regolo', modelId: model }),
  }),
  getGreenPTProvider: () => ({
    chat: (model: string) => ({ provider: 'greenpt', modelId: model }),
  }),
  getScalewayProvider: () => ({
    chat: (model: string) => ({ provider: 'scaleway', modelId: model }),
  }),
  routeMistralModel: (model: string) => ({ model, upstream: 'mistral' }),
  LITELLM_DEFAULT_BASE_URL: '',
  REGOLO_BASE_URL: '',
  GREENPT_BASE_URL: '',
  MISTRAL_API_URL: '',
  logProviderAvailability: () => {},
}));

vi.mock('../usageTracking.js', () => ({
  withUsageTracking: (model: unknown) => model,
}));

const { getMonitorModel } = await import('../providers.js');

function hostOf(model: unknown): { provider: string; modelId: string } {
  return model as { provider: string; modelId: string };
}

describe('getMonitorModel', () => {
  beforeEach(() => {
    isProviderConfigured.mockReset();
  });

  it('schreibt auf GreenPT — und dort mit einem Modell, das nicht denkt', () => {
    isProviderConfigured.mockImplementation((p) => p === 'greenpt');

    const host = hostOf(getMonitorModel());

    expect(host.provider).toBe('greenpt');
    // NICHT `gemma4`: das denkt immer (~5.400 Zeichen) und liefert bei den
    // gedeckelten Monitor-Aufrufen leeren Text.
    expect(host.modelId).toBe('mistral-small-3.2-24b-instruct-2506');
  });

  it('fällt ohne GreenPT auf Mistral zurück, nie auf litellm/Verdigado', () => {
    // litellm ist absichtlich konfiguriert: früher gewann es hier.
    isProviderConfigured.mockImplementation((p) => p === 'litellm');

    expect(hostOf(getMonitorModel()).provider).toBe('mistral');
  });
});
