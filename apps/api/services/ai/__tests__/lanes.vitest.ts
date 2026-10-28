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
import { GEMMA_31B_ALTERNATE, GEMMA_31B_PRIMARY } from '../gemmaHosts.js';
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
    // Llama hat seit der Regolo-Abschaltung keinen eigenen Host mehr → Standard.
    expect(registry.provider).toBe('mistral');
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
    // `litellm` bis zum 29.08.2026 — der Host ist stillgelegt
    // (services/ai/litellmRetired.ts), MAIN_LLM_OVERRIDE zeigt jetzt auf Cortecs.
    ['gpt-oss-120b', 'cortecs'],
    ['gemma-4-31b-it', 'cortecs'],
    ['gemma-4-26b-a4b-it', 'cortecs'],
    ['Llama-3.3-70B-Instruct', 'mistral'],
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
    // Short creative German is what Mistral is best at, so sharepics try it
    // first; everything else leads with the Gemma 4 primary (gemmaHosts.ts).
    const gemma = GEMMA_31B_PRIMARY.provider;
    expect(laneFallback('sharepic_zitat')[0]).toBe(gemma); // mistral is primary, so dropped
    expect(laneFallback('default')[0]).toBe(gemma); // mistral is primary, so dropped
    expect(laneFallback('image_picker')[0]).toBe(gemma);
  });

  it('leaves the creation families the second Gemma host, then Mistral', () => {
    // Finished texts run on Gemma 4, structured creation on Mistral.
    //
    // Der erste Ausweich ist der ZWEITE Host derselben Gewichte
    // (GEMMA_31B_ALTERNATE, seit 28.10.2026 Cortecs). Der Primär steht in der
    // Kette, taucht hier aber NICHT auf: `laneFallback` filtert ihn heraus.
    const second = GEMMA_31B_ALTERNATE.provider;
    expect(laneFallback('antrag')).toEqual([second, 'mistral']);
    expect(laneFallback('social')).toEqual([second, 'mistral']);
  });

  it('gives the GreenPT artefact lane a host of its own model family', () => {
    // `doc_generation` liegt auf GreenPT, das in keiner der beiden Ketten
    // steht — also bleiben alle übrig. Die beiden Gemma-Hosts vorn sind hier
    // der Punkt: bis zum 28.08.2026 enthielt die Ausweichkette dieser Lane
    // keinen einzigen Host desselben Gemma 4, auf dem ihr Primär läuft.
    expect(laneFallback('doc_generation')).toEqual([
      GEMMA_31B_PRIMARY.provider,
      GEMMA_31B_ALTERNATE.provider,
      'mistral',
    ]);
    // Die beiden Hosts sind zwei Vertragspartner, nicht einer zweimal.
    expect(GEMMA_31B_PRIMARY.provider).not.toBe(GEMMA_31B_ALTERNATE.provider);
  });

  /**
   * #3064: ein Ausweichglied antwortet auf dem EIGENEN Standardmodell seines
   * Anbieters, nicht auf dem des Primärs (`runChain` in ../generate.ts). Für
   * `litellm` war das `verdigado-pro` = gpt-oss, ein Denkmodell — jede Lane mit
   * kleinem Ausgabebudget, die bis dorthin durchfiel, bekam eine Vorrede statt
   * einer Antwort. Kein Ausweichort darf ein Modell sein, das die Anfrage nicht
   * beantworten kann.
   */
  it('lists no retired host in any chain', () => {
    for (const lane of LANE_IDS) {
      expect(laneFallback(lane), lane).not.toContain('litellm');
    }
  });
});
