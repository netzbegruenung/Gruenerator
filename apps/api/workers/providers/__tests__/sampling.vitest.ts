/**
 * What sampling parameters each adapter actually hands the SDK.
 *
 * Two jobs, and they pull in opposite directions on purpose.
 *
 * 1. An explicit `temperature: 0` must survive. Three adapters read their
 *    options with `||`, so a caller asking for greedy decoding got the
 *    provider default instead — silently, because 0 is falsy. `queryPlannerNode`
 *    asks for 0.0 and was sampled at 0.7; `generateStructured` runs its repair
 *    turn at 0 deliberately and was likewise sampled at 0.7 on every
 *    litellm-routed lane. Its own test asserts `temperature: 0` at the pool
 *    boundary and is green — the value was destroyed one layer below it.
 *
 * 2. The defaults DIVERGE per provider, and that is pinned here rather than
 *    tidied away. mistral runs the type/platform table in `services/ai/config.ts`,
 *    litellm hardcodes 0.7/1.0, regolo and greenpt hardcode 0/0.1. So the same
 *    request gets different parameters depending on which provider answers —
 *    which, on the fallback path, is not something the caller chose. Collapsing
 *    the four adapters into one must not quietly flatten this, and the commit
 *    that unifies it must have to change a red test to say so.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateText = vi.fn();

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateText(...args),
  jsonSchema: (s: unknown) => s,
}));
vi.mock('../../../services/ai/providers.js', () => ({
  getModel: vi.fn((provider: string, model: string) => ({ provider, modelId: model })),
  isProviderConfigured: vi.fn(() => true),
  getDefaultModel: vi.fn(() => 'default-model'),
}));
vi.mock('../../../services/tools/index.js', () => ({
  default: { prepareToolsPayload: vi.fn(() => ({})) },
}));

const { execute: mistral } = await import('../mistralAdapter.js');
const { execute: litellm } = await import('../litellmAdapter.js');
const { execute: regolo } = await import('../regoloAdapter.js');
const { execute: greenpt } = await import('../greenptAdapter.js');

type Execute = (requestId: string, data: never) => Promise<unknown>;

const ADAPTERS: Array<{ name: string; execute: Execute }> = [
  { name: 'mistral', execute: mistral as Execute },
  { name: 'litellm', execute: litellm as Execute },
  { name: 'regolo', execute: regolo as Execute },
  { name: 'greenpt', execute: greenpt as Execute },
];

function request(options: Record<string, unknown> = {}) {
  return {
    type: 'chat',
    messages: [{ role: 'user' as const, content: 'Hallo' }],
    options,
  };
}

/** The options object the adapter handed `generateText`. */
function sentToSdk(): { temperature?: number; topP?: number; maxOutputTokens?: number } {
  return generateText.mock.calls[0][0] as {
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  generateText.mockResolvedValue({ text: 'Antwort', finishReason: 'stop' });
});

describe('an explicit sampling value reaches the model', () => {
  for (const { name, execute } of ADAPTERS) {
    it(`${name}: temperature 0 stays 0`, async () => {
      await execute('req', request({ temperature: 0 }) as never);
      expect(sentToSdk().temperature).toBe(0);
    });

    it(`${name}: top_p 0 stays 0`, async () => {
      await execute('req', request({ top_p: 0 }) as never);
      expect(sentToSdk().topP).toBe(0);
    });

    it(`${name}: a non-zero value is passed through unchanged`, async () => {
      await execute('req', request({ temperature: 0.42, top_p: 0.55 }) as never);
      expect(sentToSdk().temperature).toBe(0.42);
      expect(sentToSdk().topP).toBe(0.55);
    });
  }
});

/**
 * The defaults, as they stand. Not an endorsement — a fixture. Whoever changes
 * these numbers is making a generation-quality decision and should have to say
 * so in a diff, not discover it later in an eval run.
 */
describe('per-provider defaults when the caller says nothing', () => {
  const EXPECTED: Record<string, { temperature: number; topP: number }> = {
    // From getGenerationConfig({type:'chat'}): no type entry, so the generic
    // default 0.35, and topP follows from the temperature band (<= 0.5 → 0.9).
    mistral: { temperature: 0.35, topP: 0.9 },
    litellm: { temperature: 0.7, topP: 1.0 },
    regolo: { temperature: 0, topP: 0.1 },
    greenpt: { temperature: 0, topP: 0.1 },
  };

  for (const { name, execute } of ADAPTERS) {
    it(`${name} defaults to ${EXPECTED[name].temperature} / ${EXPECTED[name].topP}`, async () => {
      await execute('req', request() as never);
      expect(sentToSdk().temperature).toBe(EXPECTED[name].temperature);
      expect(sentToSdk().topP).toBe(EXPECTED[name].topP);
    });
  }

  it('only mistral caps output tokens by type/platform', async () => {
    // A twitter post is capped at 120 tokens on mistral (PLATFORM_MAX_TOKENS)
    // and uncapped on the other three — so the same post is a different length
    // depending on which provider the fallback chain reached.
    const social = {
      type: 'social',
      messages: [{ role: 'user' as const, content: 'Post' }],
      options: {},
      metadata: { platforms: ['twitter'] },
    };

    await mistral('req', social as never);
    expect(sentToSdk().maxOutputTokens).toBe(120);

    for (const { execute } of [ADAPTERS[1], ADAPTERS[2], ADAPTERS[3]]) {
      generateText.mockClear();
      await execute('req', social as never);
      expect(sentToSdk().maxOutputTokens).toBeUndefined();
    }
  });
});
