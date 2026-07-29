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
