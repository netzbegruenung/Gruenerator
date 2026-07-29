/**
 * The lane registry must route exactly as the if/else chain it replaces.
 *
 * This is a parity test, not a specification: it drives every known `type`
 * through both `selectProviderAndModel` (the chain) and `laneTarget` (the
 * registry) and demands they agree. It is the only thing standing between a
 * table rewrite and a silent re-routing of ~66 call sites, and it is meant to
 * be deleted along with `providerSelector` once nothing calls the chain.
 */
import { describe, it, expect } from 'vitest';

import { selectProviderAndModel } from '../../providers/providerSelector.js';
import { AI_LANES, laneFallback, laneTarget, providerForModel, resolveLane } from '../lanes.js';
import { getDefaultModel } from '../providers.js';

import type { LaneId } from '../lanes.js';

const LANE_IDS = Object.keys(AI_LANES) as LaneId[];

describe('parity with providerSelector', () => {
  for (const lane of LANE_IDS) {
    if (lane === 'default') continue;

    it(`${lane} routes the same way in both`, () => {
      const chain = selectProviderAndModel({ type: lane, env: {} });
      const registry = laneTarget(lane, {}, {});

      expect(registry.provider).toBe(chain.provider);
      expect(registry.model ?? getDefaultModel(registry.provider)).toBe(chain.model);
    });
  }

  it('an unrouted type lands where the chain put it', () => {
    const chain = selectProviderAndModel({ type: 'no_such_type', env: {} });
    const registry = laneTarget(resolveLane('no_such_type'), {}, {});

    expect(registry.provider).toBe(chain.provider);
    expect(registry.model).toBe(chain.model);
  });

  it('a caller-named model wins in both', () => {
    const chain = selectProviderAndModel({ type: 'qa_draft', options: { model: 'mine' }, env: {} });
    const registry = laneTarget('qa_draft', { model: 'mine' }, {});

    expect(registry.model).toBe('mine');
    expect(chain.model).toBe('mine');
  });

  it('MAIN_LLM_OVERRIDE wins in both', () => {
    const env = { MAIN_LLM_OVERRIDE: 'Llama-3.3-70B-Instruct' };
    const chain = selectProviderAndModel({ type: 'sharepic_zitat', env });
    const registry = laneTarget('sharepic_zitat', {}, env);

    expect(registry).toEqual({ provider: chain.provider, model: chain.model });
    expect(registry.provider).toBe('regolo');
  });
});

describe('resolveLane', () => {
  it('recognises a known type', () => {
    expect(resolveLane('sharepic_zitat')).toBe('sharepic_zitat');
  });

  it('sends an unknown type to the default lane', () => {
    expect(resolveLane('etwas_neues')).toBe('default');
  });
});

describe('providerForModel', () => {
  it.each([
    ['mistral-medium-2604', 'mistral'],
    ['mistral-large-latest', 'mistral'],
    ['gpt-oss-120b', 'litellm'],
    ['Llama-3.3-70B-Instruct', 'regolo'],
    ['regolo/qwen3.5-122b', 'regolo'],
    ['', 'mistral'],
  ])('%s → %s', (model, provider) => {
    expect(providerForModel(model)).toBe(provider);
  });
});

describe('laneFallback', () => {
  it('never lists the lane its own primary', () => {
    for (const lane of LANE_IDS) {
      expect(laneFallback(lane), lane).not.toContain(AI_LANES[lane].provider);
    }
  });

  it('drops the primary from the chain and keeps the rest in order', () => {
    // Matches the two chains `providerFallback` runs today: short creative
    // German is what Mistral is best at, so sharepics try it first.
    expect(laneFallback('sharepic_zitat')[0]).toBe('litellm'); // mistral is primary, so dropped
    expect(laneFallback('default')[0]).toBe('regolo'); // litellm is primary, so dropped
    expect(laneFallback('image_picker')[0]).toBe('litellm'); // regolo is primary, so dropped
  });

  it('makes GPT-OSS the fallback for both creation families, not the primary', () => {
    // Finished texts run on Gemma 4 (regolo), structured creation on Mistral.
    // Either way litellm/GPT-OSS is now the first fallback rather than where
    // these lanes started.
    expect(laneFallback('antrag')).toEqual(['litellm', 'mistral']);
    expect(laneFallback('social')).toEqual(['litellm', 'mistral']);
    expect(laneFallback('doc_generation')).toEqual(['litellm', 'regolo']);
  });
});
