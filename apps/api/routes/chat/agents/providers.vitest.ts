import { describe, it, expect } from 'vitest';

import {
  AVAILABLE_MODELS,
  getContextWindow,
  loopSynthChoice,
  getModelConfig,
  getLoopPlannerModel,
  loopPlannerModelName,
  prefersUnifiedLoop,
  resolveModelTuple,
} from './providers.js';

const WRITER_MODELS = new Set(['gemma4-31b', 'verdigado-pro']);

describe('prefersUnifiedLoop (unified vs planner/executor split)', () => {
  it('Mistral (fast native tool-caller) runs the unified single-model loop', () => {
    expect(prefersUnifiedLoop('mistral', 'mistral-medium-2604')).toBe(true);
  });
  it('every other provider runs the split (planner does tools, selection writes)', () => {
    expect(prefersUnifiedLoop('litellm', 'verdigado-think')).toBe(false);
    expect(prefersUnifiedLoop('litellm', 'verdigado-pro')).toBe(false);
    expect(prefersUnifiedLoop('regolo', 'gemma4-31b')).toBe(false);
    expect(prefersUnifiedLoop('regolo', 'gpt-oss-120b')).toBe(false);
    expect(prefersUnifiedLoop('regolo', 'qwen3.5-122b')).toBe(false);
  });
});

describe('split-mode model policy (getLoopSynthModel / loopPlannerModelName)', () => {
  it('planner is a verified NON-Chinese tool-caller', () => {
    // The three declared tiers (autoPolicy.ts): GreenPT's Mistral Small first,
    // then self-hosted regolo, then litellm/verdigado-pro. Tool calls were
    // verified live on all three on 13.08.2026.
    const planner = loopPlannerModelName();
    expect([
      'mistral-small-3.2-24b-instruct-2506',
      'mistral-small-4-119b',
      'verdigado-pro',
    ]).toContain(planner);
    // The invariant behind that list, spelled out so widening the constants
    // cannot quietly slip a banned lane into the slot.
    expect(planner).not.toMatch(/qwen|glm|kimi|minimax|deepseek|think/i);
  });

  it('the planner never runs Mistral Small on the vendor API', () => {
    // Mistral Small is served from GreenPT (Scaleway Paris) or self-hosted on
    // Regolo — never `mistral-small-latest`, which would bill the Mistral API.
    // The lane moved hosts on 13.08.2026; the rule about the vendor API did not.
    expect(loopPlannerModelName()).not.toBe('mistral-small-latest');
  });

  it('resolves to a usable model even when NO provider is configured', () => {
    // The slot must never land on a lane whose getter throws on a missing key.
    // It did between 13. and 14.08.2026: the last-resort branch returned the
    // GreenPT tier, so with nothing configured every agentic turn died with
    // "GREENPT_API_KEY environment variable is required" before its first model
    // call — ten loop scenarios red, and in production a deployment that forgot
    // the key would have lost the whole loop rather than one lane.
    //
    // This assertion holds in both worlds: with a key the primary builds, and
    // in a keyless CI the litellm tier does (default base URL, empty key
    // tolerated). What it forbids is the throw.
    expect(() => getLoopPlannerModel()).not.toThrow();
  });

  it('auto selection writes with the best writer, NEVER a think model', () => {
    const choice = loopSynthChoice('verdigado-think', true);
    expect(choice.provider).not.toBeNull();
    expect(WRITER_MODELS.has(choice.model)).toBe(true);
    expect(choice.model).not.toBe('verdigado-think');
  });

  it('a think-lane selection is ALSO rewritten to a fast writer (latency fix)', () => {
    // The user picking the gemma-4 lane resolves to verdigado-think as primary;
    // synthesis must not run on the reasoning model even though it isn't "auto".
    const choice = loopSynthChoice('verdigado-think', false);
    expect(choice.provider).not.toBeNull();
    expect(choice.model).not.toBe('verdigado-think');
    expect(WRITER_MODELS.has(choice.model)).toBe(true);
  });

  it('an explicit fast model selection is honored verbatim (no swap)', () => {
    const choice = loopSynthChoice('verdigado-pro', false);
    expect(choice.provider).toBeNull();
    expect(choice.model).toBe('verdigado-pro');
  });

  it('never routes a Chinese model into the synth slot', () => {
    for (const isAuto of [true, false]) {
      expect(loopSynthChoice('qwen3.5-122b', isAuto).model).not.toMatch(/qwen/);
    }
  });
});

describe('AVAILABLE_MODELS', () => {
  it('all entries have contextWindow field', () => {
    for (const [id, config] of Object.entries(AVAILABLE_MODELS)) {
      expect(config.contextWindow, `${id} missing contextWindow`).toBeGreaterThan(0);
    }
  });
});

describe('getContextWindow', () => {
  // Measured, not copied from datasheets. Mistral reports its own limit on
  // overflow (`262144 maximum context length`); the Ollama-backed Verdigado
  // lanes silently truncate instead of erroring, so they stay below the
  // measured fallback rather than at the nominal window.
  //
  // Re-measured 2026-07-31 (needle at prompt start): ~130k sent came back with
  // prompt_tokens 122,956 and the needle intact, ~155k collapsed to 65,539
  // with the needle gone. 120k sits under the highest verified value; the
  // tag's 128k would sit in the unmeasured stretch right before the cliff.
  it('returns correct context window for known models', () => {
    expect(getContextWindow('mistral-large')).toBe(262_144);
    expect(getContextWindow('gpt-oss')).toBe(120_000);
    // Gemma 4 reports the FULL window since it moved off Verdigado — the 64k
    // ceiling was Ollama's silent-truncation guard, and nothing routes there
    // for this lane any more.
    expect(getContextWindow('gemma-4')).toBe(262_144);
    expect(getContextWindow('regolo')).toBe(262_144);
  });

  it('returns default for unknown model', () => {
    expect(getContextWindow('nonexistent-model')).toBe(32768);
  });

  it('returns default for null/undefined model', () => {
    expect(getContextWindow(null)).toBe(32768);
    expect(getContextWindow(undefined)).toBe(32768);
  });

  it('uses provider fallback when model is unknown', () => {
    expect(getContextWindow('auto', 'mistral')).toBe(262_144);
    expect(getContextWindow('auto', 'litellm')).toBe(120_000);
    expect(getContextWindow('auto', 'regolo')).toBe(262_144);
  });

  it('legacy litellm ID resolves to overflow lane window', () => {
    expect(getContextWindow('litellm', 'mistral')).toBe(120_000);
  });

  // The unknown-model fallback stays conservative on purpose: an unrecognised
  // model may be small, and over-declaring costs silent truncation upstream.
  it('keeps the unknown-model fallback conservative', () => {
    expect(getContextWindow('nonexistent-model')).toBe(32768);
  });
});

describe('getModelConfig', () => {
  it('returns single config for pinned models', () => {
    const config = getModelConfig('mistral-large');
    expect(config).not.toBeNull();
    expect(config!.kind).toBe('single');
    if (config!.kind === 'single') {
      expect(config.provider).toBe('mistral');
      expect(config.contextWindow).toBe(262_144);
    }
  });

  it('returns overflow config for the gpt-oss lane', () => {
    const config = getModelConfig('gpt-oss');
    expect(config).not.toBeNull();
    expect(config!.kind).toBe('overflow');
    if (config!.kind === 'overflow') {
      expect(config.primary.provider).toBe('litellm');
      expect(config.overflow.provider).toBe('regolo');
      expect(config.contextWindow).toBe(120_000);
    }
  });

  it('aliases legacy IDs to the new overflow lanes', () => {
    expect(getModelConfig('litellm')).toBe(getModelConfig('gpt-oss'));
    expect(getModelConfig('gpt-oss-regolo')).toBe(getModelConfig('gpt-oss'));
    expect(getModelConfig('gemma-litellm')).toBe(getModelConfig('gemma-4'));
    expect(getModelConfig('gemma-regolo')).toBe(getModelConfig('gemma-4'));
  });

  it('returns null for unknown model', () => {
    expect(getModelConfig('nonexistent')).toBeNull();
  });
});

describe('resolveModelTuple — size-aware overflow routing', () => {
  // Stufe 2: an overflow lane serves two very differently sized backends. The
  // reported contextWindow must follow the side actually chosen, otherwise the
  // request is pruned to the small lane's budget while running on the big one.
  // Gemma 4 left the overflow scheme on 2026-07-31: Verdigado's Gemma answers
  // in 38s against Regolo's 4s and thinks unstoppably (no flag disables it on
  // that host), so there is no load-balancing decision left to make — see
  // GEMMA_4_REGOLO. Verdigado stays reachable as the failover ONLY; these pin
  // that a normal turn never lands there.
  it('always resolves Gemma 4 to Regolo, never to Verdigado', async () => {
    const tuple = await resolveModelTuple('gemma-4', 'req-primary');
    expect(tuple).not.toBeNull();
    expect(tuple!.provider).toBe('regolo');
    expect(tuple!.model).toBe('gemma4-31b');
    // Regolo is hosted, so the lane reports the full model context instead of
    // Verdigado's conservative silent-truncation ceiling.
    expect(tuple!.contextWindow).toBe(262_144);
  });

  it('takes no Verdigado slot for Gemma 4', async () => {
    const tuple = await resolveModelTuple('gemma-4', 'req-noslot');
    // The slot rations Verdigado's single inference slot. A lane that never
    // runs there must not hold it — holding one would starve GPT-OSS.
    expect(tuple!.releaseSlot).toBeUndefined();
  });

  it('fails over to the Verdigado side of the same weights when Regolo hangs', async () => {
    const tuple = await resolveModelTuple('gemma-4', 'req-fallback');
    // Same model family rather than a different writer. Deliberately accepted:
    // this failover is SLOW (20s to first token) and runs without the Verdigado
    // slot — see the note on GEMMA_4_REGOLO.
    expect(tuple!.sibling).toEqual({ provider: 'litellm', model: 'verdigado-think' });
  });

  it('preferOverflow is a no-op for Gemma 4 now that it is a single lane', async () => {
    const tuple = await resolveModelTuple('gemma-4', 'req-overflow', { preferOverflow: true });
    expect(tuple!.provider).toBe('regolo');
    expect(tuple!.contextWindow).toBe(262_144);
  });

  it('preferOverflow is a no-op for single lanes', async () => {
    const tuple = await resolveModelTuple('mistral-medium-3.5', 'req-single', {
      preferOverflow: true,
    });
    expect(tuple!.provider).toBe('mistral');
    expect(tuple!.contextWindow).toBe(262_144);
  });
});
