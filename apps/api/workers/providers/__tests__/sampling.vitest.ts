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

const { execute } = await import('../execute.js');

const PROVIDERS = ['mistral', 'litellm', 'regolo', 'greenpt'] as const;
type Provider = (typeof PROVIDERS)[number];
const run = (provider: Provider, data: unknown) => execute(provider, 'req', data as never);

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
  for (const name of PROVIDERS) {
    it(`${name}: temperature 0 stays 0`, async () => {
      await run(name, request({ temperature: 0 }));
      expect(sentToSdk().temperature).toBe(0);
    });

    it(`${name}: top_p 0 stays 0`, async () => {
      await run(name, request({ top_p: 0 }));
      expect(sentToSdk().topP).toBe(0);
    });

    it(`${name}: a non-zero value is passed through unchanged`, async () => {
      await run(name, request({ temperature: 0.42, top_p: 0.55 }));
      expect(sentToSdk().temperature).toBe(0.42);
      expect(sentToSdk().topP).toBe(0.55);
    });
  }
});

/**
 * The defaults, now identical across providers.
 *
 * They were not. mistral consulted the type/platform table, litellm hardcoded
 * 0.7/1.0, regolo and greenpt hardcoded 0/0.1 — and which one a request got was
 * decided by the fallback chain rather than by the caller. This block is what
 * that change had to walk through: it asserted the divergence before, so the
 * commit unifying it could not happen quietly.
 */
describe('sampling is the same wherever the request lands', () => {
  it('every provider gets the type default', async () => {
    // getGenerationConfig({type:'chat'}): no entry for `chat`, so the generic
    // default 0.35, and topP follows the temperature band (<= 0.5 → 0.9).
    for (const name of PROVIDERS) {
      generateText.mockClear();
      await run(name, request());
      expect(sentToSdk().temperature, name).toBe(0.35);
      expect(sentToSdk().topP, name).toBe(0.9);
    }
  });

  it('a formal type is cool on every provider', async () => {
    for (const name of PROVIDERS) {
      generateText.mockClear();
      await run(name, { ...request(), type: 'presse' });
      expect(sentToSdk().temperature, name).toBe(0.3);
    }
  });

  it('a twitter post is capped at 120 tokens on every provider', async () => {
    // The clearest case of the old split: capped on mistral by
    // PLATFORM_MAX_TOKENS, uncapped everywhere else — so the same post came out
    // a different length depending on which lane the fallback chain reached.
    const social = {
      type: 'social',
      messages: [{ role: 'user' as const, content: 'Post' }],
      options: {},
      metadata: { platforms: ['twitter'] },
    };

    for (const name of PROVIDERS) {
      generateText.mockClear();
      await run(name, social);
      expect(sentToSdk().maxOutputTokens, name).toBe(120);
    }
  });

  it('greedy decoding gets top_p 1 rather than a stray narrow value', async () => {
    for (const name of PROVIDERS) {
      generateText.mockClear();
      await run(name, request({ temperature: 0, top_p: 0.1 }));
      expect(sentToSdk().temperature, name).toBe(0);
      expect(sentToSdk().topP, name).toBe(1);
    }
  });
});
