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

vi.mock('../../ai/cortecsEndpoint.js', () => ({
  cortecsBaseUrl: () => 'https://cortecs.example/v1',
}));
vi.mock('../../ai/scalewayEndpoint.js', () => ({
  scalewayBaseUrl: () => 'https://scaleway.example/v1',
}));

// Mocked rather than imported for real: the module pulls the whole provider
// construction site (AI SDK clients included) and all this test needs from it is
// one boolean and one URL.
const routing = { enabled: false };
vi.mock('../../ai/providerInstances.js', () => ({
  isScalewayMistralRoutingEnabled: () => routing.enabled,
  MISTRAL_API_URL: 'https://mistral.example/v1',
}));

const envMock: {
  SCALEWAY_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  CORTECS_API_KEY?: string;
} = {
  SCALEWAY_API_KEY: 'test-key',
  MISTRAL_API_KEY: 'mistral-test-key',
  CORTECS_API_KEY: 'cortecs-test-key',
};
vi.mock('../../../config/env.js', () => ({
  get env() {
    return envMock;
  },
}));

const { leadModel, workerModel } = await import('./models.js');

beforeEach(() => {
  constructed.length = 0;
  envMock.SCALEWAY_API_KEY = 'test-key';
  envMock.MISTRAL_API_KEY = 'mistral-test-key';
  envMock.CORTECS_API_KEY = 'cortecs-test-key';
  routing.enabled = false; // the deployed default since 08/2026
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
    // Same weights either way — only the name the host knows them by changes.
    expect(configOf(leadModel).model).toBe('mistral-medium-2604');
    routing.enabled = true;
    expect(configOf(leadModel).model).toBe('mistral-medium-3.5-128b');
  });

  it('follows the Scaleway switch, though nothing here goes through routeMistralModel', () => {
    // The regression this exists for: when Mistral Medium moved back off
    // Scaleway (08/2026), this lane was missed on the first pass. It builds its
    // own ChatOpenAI and names the host in a local constant, so neither the
    // routing table nor a grep for `routeMistralModel` led here — and deep
    // research kept running on the upstream everything else had just left.
    expect(configOf(leadModel).configuration?.baseURL).toBe('https://mistral.example/v1');

    routing.enabled = true;
    expect(configOf(leadModel).configuration?.baseURL).toBe('https://scaleway.example/v1');
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
    expect(worker.model).toBe('gemma-4-31b-it');
  });

  it('schickt KEIN reasoning_effort — infercom weist den Wert ab', () => {
    // Die Umkehrung des alten Wächters, und aus gemessenem Grund: dieses Modell
    // liegt bei infercom, das `reasoning_effort` mit HTTP 400 beantwortet
    // ("value must be one of 'low', 'medium', 'high'"). Nötig wäre der Wert
    // ohnehin nicht — das Modell denkt von sich aus nicht.
    //
    // Was NICHT zurückkommen darf: GreenPT als Worker-Host. Sein `gemma4`
    // nimmt den Wert an und ignoriert ihn (~5.400 Zeichen Denken je Schritt),
    // was für einen Loop ruinös ist — 500 s ohne Bericht gegen 156 s.
    expect(configOf(workerModel).modelKwargs).not.toHaveProperty('reasoning_effort');
  });

  it('does not batch tool calls — a worker never delegates', () => {
    expect(configOf(workerModel).modelKwargs).toMatchObject({ parallel_tool_calls: false });
  });

  it('bleibt auf Cortecs, was auch immer das Mistral-Routing tut', () => {
    // The switch is about Mistral Medium's host, and Gemma is not Mistral. The
    // worker's reason for sitting here is untouched by it — so it must NOT
    // ride along.
    expect(configOf(workerModel).configuration?.baseURL).toBe('https://cortecs.example/v1');
    routing.enabled = true;
    expect(configOf(workerModel).configuration?.baseURL).toBe('https://cortecs.example/v1');
  });
});

describe('configuration faults', () => {
  it('names the key the lead actually needs, which depends on the routing', () => {
    delete envMock.MISTRAL_API_KEY;
    expect(() => leadModel()).toThrow(/MISTRAL_API_KEY/);

    routing.enabled = true;
    envMock.MISTRAL_API_KEY = 'mistral-test-key';
    delete envMock.SCALEWAY_API_KEY;
    expect(() => leadModel()).toThrow(/SCALEWAY_API_KEY/);
  });

  it('names the missing key instead of failing somewhere inside a run', () => {
    delete envMock.CORTECS_API_KEY;
    expect(() => workerModel()).toThrow(/CORTECS_API_KEY/);
  });

  it('der Worker haengt am Cortecs-Schluessel, nicht mehr am Scaleway-Schluessel', () => {
    // Nach dem Umzug vom 21.08.2026 die eigentliche Trennlinie: ein
    // Deployment, das nur noch den alten Schluessel fuehrt, faellt hier auf.
    delete envMock.SCALEWAY_API_KEY;
    expect(() => workerModel()).not.toThrow();
  });
});
