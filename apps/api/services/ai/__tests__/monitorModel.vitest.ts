/**
 * Welchen Host der Monitor benutzt — und welchen NICHT.
 *
 * Der Monitor lief bis 19.08.2026 auf litellm/verdigado-pro. Verdigado hat
 * einen einzigen Inferenz-Slot, und derselbe Host war zugleich der Ausweg der
 * Chat-Gemma-Lane: ein stündlicher Hintergrundlauf konnte damit einem
 * wartenden Menschen den Ausweichhost wegnehmen. Danach lief er bis 19.11.2026
 * auf GreenPT (Small 3.2), das an dem Tag im Median 8,4 s für kurze Aufrufe
 * brauchte. Diese Fälle halten fest, dass er auf Melious Gemma `:eco` schreibt und
 * nie auf litellm/Verdigado oder GreenPT landet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const isProviderConfigured = vi.fn<(p: string) => boolean>();

vi.mock('../providerInstances.js', () => ({
  isProviderConfigured: (p: string) => isProviderConfigured(p),
  // Jeder Client gibt ein durchsichtiges Modell zurück, das sich merkt, wer es
  // gebaut hat — mehr braucht die Frage „welcher Host" nicht.
  getMistralChatModel: (model: string) => ({ provider: 'mistral', modelId: model }),
  getLiteLLMProvider: () => ({
    chat: (model: string) => ({ provider: 'litellm', modelId: model }),
  }),
  getGreenPTProvider: () => ({
    chat: (model: string) => ({ provider: 'greenpt', modelId: model }),
  }),
  getMeliousProvider: () => ({
    chat: (model: string) => ({ provider: 'melious', modelId: model }),
  }),
  LITELLM_DEFAULT_BASE_URL: '',
  GREENPT_BASE_URL: '',
  MISTRAL_API_URL: '',
  logProviderAvailability: () => {},
}));

const { getMonitorModel } = await import('../providers.js');

function hostOf(model: unknown): { provider: string; modelId: string } {
  return model as { provider: string; modelId: string };
}

describe('getMonitorModel', () => {
  beforeEach(() => {
    isProviderConfigured.mockReset();
  });

  it('schreibt auf Melious Gemma :eco, nicht auf GreenPT', () => {
    // Nicht zeitkritisch, also der sparsame Upstream.
    isProviderConfigured.mockImplementation((p) => p === 'melious' || p === 'greenpt');

    const host = hostOf(getMonitorModel());

    expect(host.provider).toContain('melious');
    expect(host.modelId).toBe('gemma-4-31b:eco');
  });

  it('fällt ohne Melious auf Mistral zurück, nie auf litellm/Verdigado', () => {
    // litellm ist absichtlich konfiguriert: früher gewann es hier.
    isProviderConfigured.mockImplementation((p) => p === 'litellm');

    expect(hostOf(getMonitorModel()).provider).toBe('mistral');
  });
});
