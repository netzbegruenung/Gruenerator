/**
 * The lane registry: which provider and model answer which kind of request.
 */
import { describe, it, expect } from 'vitest';

import { GEMMA_31B_ALTERNATE, GEMMA_31B_PRIMARY } from '../gemmaHosts.js';
import { AI_LANES, laneFallback, laneTarget, providerForModel, resolveLane } from '../lanes.js';
import { getDefaultModel } from '../providers.js';

import type { LaneId } from '../lanes.js';

const LANE_IDS = Object.keys(AI_LANES) as LaneId[];

/** What a `type` resolves to, with the provider default filled in. */
function route(type: string): { provider: string; model: string } {
  const target = laneTarget(resolveLane(type), {}, {});
  return { provider: target.provider, model: target.model ?? getDefaultModel(target.provider) };
}

describe('the lane table', () => {
  // A verdigado alias under the Mistral provider is a 400 on every request:
  // the provider and the model of a lane have to name the same host.
  it('routes structured creation to Mistral Large 4', () => {
    for (const type of [
      'board_generation',
      'canvas_ai_suggest',
      'website',
      'sharepic_dreizeilen',
      'sharepic_zitat',
      'sharepic_zitat_pure',
      'sharepic_headline',
      'sharepic_info',
      'sharepic_veranstaltung',
      'sharepic_simple',
      'sharepic_slider',
    ]) {
      expect(route(type), type).toEqual({ provider: 'mistral', model: 'mistral-large-4' });
    }
  });

  // GreenPT's own default writes forced tool calls as prose; the artefact lane
  // names Gemma 4 there. `documentation/scripts/generate-models.mjs` reads this row.
  it('routes artifact generation to Gemma 4 on GreenPT, never to the GreenPT default', () => {
    expect(route('doc_generation')).toEqual({ provider: 'greenpt', model: 'gemma4' });
    expect(AI_LANES.doc_generation.model).not.toBeNull();
    expect(route('doc_generation').model).not.toBe(getDefaultModel('greenpt'));
  });

  it('routes finished texts to Gemma 4 on its primary host, with the model named', () => {
    for (const type of [
      'antrag',
      'antrag_simple',
      'kleine_anfrage',
      'grosse_anfrage',
      'universal',
      'leichte_sprache',
      'custom_prompt',
      'protokoll',
      'rede',
      'wahlprogramm',
      'buergeranfragen',
      'social',
      'social_post_edit',
      'subtitler_social',
    ]) {
      expect(route(type), type).toEqual({
        provider: GEMMA_31B_PRIMARY.provider,
        model: GEMMA_31B_PRIMARY.model,
      });
      expect(route(type).model, type).not.toMatch(/qwen/);
    }
  });

  it('leaves non-creation traffic on its own lanes', () => {
    expect(route('image_picker').provider).not.toBe('mistral');
  });

  it('answers types without a row on the default lane', () => {
    expect(route('text_adjustment').model).toBe('mistral-large-4');
    expect(route('chat_quality_gate').model).toBe('mistral-large-4');
    expect(route('no_such_type')).toEqual({ provider: 'mistral', model: 'mistral-large-4' });
  });

  it('lets a caller-named model win', () => {
    expect(laneTarget('doc_generation', { model: 'mistral-medium-2604' }, {}).model).toBe(
      'mistral-medium-2604'
    );
  });

  it('lets MAIN_LLM_OVERRIDE win over every row', () => {
    // Llama hat seit der Regolo-Abschaltung keinen eigenen Host mehr → Standard.
    expect(
      laneTarget('sharepic_zitat', {}, { MAIN_LLM_OVERRIDE: 'Llama-3.3-70B-Instruct' })
    ).toEqual({ provider: 'mistral', model: 'Llama-3.3-70B-Instruct' });
  });

  it('never pairs a model with another host', () => {
    for (const lane of LANE_IDS) {
      const { provider, model } = route(lane);
      if (provider === 'mistral') expect(model, lane).not.toMatch(/verdigado/);
      if (provider === 'litellm') expect(model, lane).not.toMatch(/^mistral-(medium|large|small)-/);
    }
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
