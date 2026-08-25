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

import { GEMMA_31B_PRIMARY } from '../../ai/gemmaHosts.js';
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
   * Artefakte (PDF, Präsentation, Sheet, Dokument) sind die eine Ausnahme in
   * dieser Menge: gemessen ruft Mistral Medium 3.5 den erzwungenen Tool-Call
   * hier NIE auf, schreibt das JSON als Prosa und läuft ins Token-Limit — mit
   * größerem Budget schlechter statt besser (187 s bei 12k, 248 s bei 16k,
   * beide in Wiederholung degeneriert). Gemma 4 auf GreenPT ruft das Tool sauber
   * auf und terminiert.
   *
   * Das Modell muss BENANNT sein: GreenPTs eigener Default ist
   * `mistral-medium-3.5-128b` (services/ai/providers.ts) — eine Lane, die auf
   * den GreenPT-Default zurückfällt, landet also genau wieder bei dem Modell,
   * das hier gerade abgewählt wurde, nur über einen anderen Adapter.
   */
  it('routes artifact generation to Gemma 4 on GreenPT, never to the GreenPT default', () => {
    const { provider, model } = selectProviderAndModel({ type: 'doc_generation', env: {} });
    expect(provider).toBe('greenpt');
    expect(model).toBe('gemma4');
  });

  /**
   * Ein Aufrufer darf sein eigenes Modell benennen — das gilt auf der
   * Artefakt-Lane wie überall sonst.
   */
  it('lets an explicit model win on the artifact lane', () => {
    const { model } = selectProviderAndModel({
      type: 'doc_generation',
      options: { model: 'mistral-medium-2604' },
      env: {},
    });
    expect(model).toBe('mistral-medium-2604');
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
  it('routes finished texts to Gemma 4 on its zentral gewählten Host, never to the Regolo default', () => {
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
      // Gegen `GEMMA_31B_PRIMARY`, nicht gegen einen abgetippten Host: welcher
      // Vertragspartner Gemma bedient, steht seit dem 25.08.2026 in
      // services/ai/gemmaHosts.ts und nur dort.
      expect(provider, type).toBe(GEMMA_31B_PRIMARY.provider);
      expect(model, type).toBe(GEMMA_31B_PRIMARY.model);
      // Die eigentliche Aussage des Tests, host-unabhängig: diese Lanes
      // benennen ihr Modell und fallen NIE in den Regolo-Umgebungs-Default —
      // dort stand `qwen3.5-122b`.
      expect(model, type).not.toMatch(/qwen/);
    }
  });

  it('leaves non-creation traffic on its own lanes', () => {
    // The creation set must not swallow the rest of the table — lanes with an
    // explicit entry keep their models.
    expect(selectProviderAndModel({ type: 'image_picker', env: {} }).provider).not.toBe('mistral');
  });

  it('moves the lanes that only ever rode the base default off GPT-OSS', () => {
    // `text_adjustment` and `chat_quality_gate` have no branch of their own —
    // they inherited the base default, which was litellm/verdigado-pro until
    // the 2026-07-31 GPT-OSS wind-down and is Mistral Medium 3.5 now. Naming
    // them here so the move is a recorded decision rather than a side effect
    // nobody noticed: these two are the only types that changed model without
    // a line of their own being touched.
    expect(selectProviderAndModel({ type: 'text_adjustment', env: {} }).model).toBe(
      'mistral-medium-2604'
    );
    expect(selectProviderAndModel({ type: 'chat_quality_gate', env: {} }).model).toBe(
      'mistral-medium-2604'
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
