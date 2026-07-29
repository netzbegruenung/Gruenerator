/**
 * Provider AND model must come from the same decision.
 *
 * They did not for `type: 'website'`. The route asked for Mistral by setting a
 * top-level `provider: 'mistral'` on the payload — but that field picks the
 * ADAPTER only; the model still came from here, and with no `website` entry it
 * was the litellm default `verdigado-pro`. So every candidate-site generation
 * posted a verdigado alias to the Mistral API, took the error, and was rescued
 * by the fallback chain. It worked, at the price of one guaranteed-failing
 * round trip per request — invisible because the fallback covered it.
 */
import { describe, it, expect } from 'vitest';

import { selectProviderAndModel } from '../providerSelector.js';

describe('selectProviderAndModel — provider and model agree', () => {
  it('routes website generation to a Mistral model, not a verdigado alias', () => {
    const { provider, model } = selectProviderAndModel({ type: 'website' });
    expect(provider).toBe('mistral');
    expect(model).toBe('mistral-medium-2604');
  });

  /**
   * Everything that creates content runs on Mistral Medium 3.5.
   *
   * Most of these had no entry and fell through to the base default
   * verdigado-pro (GPT-OSS 120B). For the artifact lanes that is not a taste
   * question: they force a tool call, and GPT-OSS answers with prose instead —
   * which is what killed a PDF generation in production (two attempts, both
   * `stop_reason=stop`, no tool call).
   *
   * The list is spelled out rather than imported from the module so that
   * dropping a type out of the set fails HERE instead of silently sending that
   * lane back to GPT-OSS.
   */
  it('routes structured creation to Mistral Medium 3.5', () => {
    const structureTypes = [
      'doc_generation',
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
    ];

    for (const type of structureTypes) {
      const { provider, model } = selectProviderAndModel({ type, env: {} });
      expect(provider, type).toBe('mistral');
      expect(model, type).toBe('mistral-medium-2604');
    }
  });

  /**
   * Finished texts go to Gemma 4 — the best German writer, which is why it also
   * holds the chat loop's synth slot.
   *
   * The model must be NAMED: Regolo's default is `qwen3.5-122b`, and qwen is
   * excluded by policy (AVOID_AS_SYNTH in routes/chat/agents/autoPolicy.ts).
   * A lane that resolves to the bare Regolo default is a policy breach, not a
   * style choice — hence the explicit model assertion on every type.
   */
  it('routes finished texts to Gemma 4 on Regolo, never to the Regolo default', () => {
    const textTypes = [
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
      'social_post_generation',
      'social_post_edit',
      'subtitler_social',
    ];

    for (const type of textTypes) {
      const { provider, model } = selectProviderAndModel({ type, env: {} });
      expect(provider, type).toBe('regolo');
      expect(model, type).toBe('gemma4-31b');
      expect(model, type).not.toMatch(/qwen/);
    }
  });

  it('leaves non-creation traffic on its own lanes', () => {
    // The creation set must not swallow the rest of the table — chat, search
    // and the fast helper lanes keep their models.
    expect(selectProviderAndModel({ type: 'image_picker', env: {} }).provider).not.toBe('mistral');
    expect(selectProviderAndModel({ type: 'text_adjustment', env: {} }).model).toBe(
      'verdigado-pro'
    );
    expect(selectProviderAndModel({ type: 'chat_quality_gate', env: {} }).model).toBe(
      'verdigado-pro'
    );
  });

  it('still lets a caller name its own model on that lane', () => {
    const { provider, model } = selectProviderAndModel({
      type: 'website',
      options: { model: 'mistral-large-latest' },
    });
    expect(provider).toBe('mistral');
    expect(model).toBe('mistral-large-latest');
  });

  /**
   * The general shape of the defect, kept as a standing check: whatever lane a
   * type resolves to, the model has to be one that provider can serve. A
   * verdigado alias on Mistral (or the reverse) is the failure this file exists
   * for.
   */
  it('never pairs a verdigado alias with the Mistral provider', () => {
    const types = [
      'website',
      'notebook_enrich',
      'qa_draft',
      'qa_draft_fast',
      'qa_tools',
      'qa_planner',
      'qa_repair',
      'antrag',
      'antrag_simple',
      'kleine_anfrage',
      'grosse_anfrage',
      'image_picker',
      'antrag_question_generation',
      'antrag_qa_summary',
      'gruenerator_ask',
      'gruenerator_ask_grundsatz',
      'sharepic_dreizeilen',
      'sharepic_zitat',
      'sharepic_zitat_pure',
      'sharepic_headline',
      'sharepic_info',
      'sharepic_veranstaltung',
      'sharepic_simple',
      'sharepic_slider',
      'presse',
      'social',
      'doc_generation',
      'board_generation',
      'canvas_ai_suggest',
    ];

    for (const type of types) {
      const { provider, model } = selectProviderAndModel({ type, env: {} });
      if (provider === 'mistral') {
        expect(model, `${type} on mistral`).not.toMatch(/verdigado/);
      }
      if (provider === 'litellm') {
        expect(model, `${type} on litellm`).not.toMatch(/^mistral-(medium|large|small)-/);
      }
    }
  });
});
