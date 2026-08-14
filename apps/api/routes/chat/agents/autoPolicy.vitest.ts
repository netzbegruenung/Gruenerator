import { searchIntentSchema } from '@gruenerator/contracts';
import { describe, it, expect } from 'vitest';

import { isReasoningCapable } from '../../../services/ai/modelDiscovery.js';
import { isReasoningStreamModel } from '../../../services/ai/regoloReasoningStream.js';
import { mistralReasoningOption } from '../services/responseStreamingService.js';

import { AUTO_POLICY_EXEMPT, POLICY, resolveAutoSelection, type Complexity } from './autoPolicy.js';
import { AVAILABLE_MODELS } from './providers.js';

const ALL_INTENTS = searchIntentSchema.options;
const COMPLEXITIES: Complexity[] = ['simple', 'moderate', 'complex'];

/** Every (provider, model) pair a lane id can end up on — both sides of an
 *  overflow lane, since either can serve the turn. */
function lanePairs(modelId: string): Array<{ provider: string; model: string }> {
  const cfg = AVAILABLE_MODELS[modelId];
  if (!cfg) return [];
  return cfg.kind === 'single'
    ? [{ provider: cfg.provider, model: cfg.model }]
    : [
        { provider: cfg.primary.provider, model: cfg.primary.model },
        { provider: cfg.overflow.provider, model: cfg.overflow.model },
      ];
}

/** Can this pair actually surface reasoning if we ask for it? */
function canActuallyThink(provider: string, model: string): boolean {
  if (isReasoningStreamModel(provider, model)) return true;
  return provider === 'mistral' && isReasoningCapable(model);
}

describe('autoPolicy — every intent resolves to a real lane', () => {
  it.each(ALL_INTENTS)('%s resolves to a lane present in AVAILABLE_MODELS', (intent) => {
    for (const complexity of COMPLEXITIES) {
      const { modelId } = resolveAutoSelection({ intent, complexity });
      expect(AVAILABLE_MODELS[modelId], `${intent}/${complexity} → ${modelId}`).toBeDefined();
    }
  });

  it('an unknown intent falls back to Gemma 4 instead of throwing', () => {
    const sel = resolveAutoSelection({ intent: 'not-a-real-intent' });
    // Was the GPT-OSS speed lane until the 2026-07-31 wind-down. A catch-all is
    // where that lane does the most damage: an unlisted intent may be one that
    // forces a tool call, and GPT-OSS answers those with prose.
    expect(sel.modelId).toBe('gemma-litellm');
    expect(sel.reasoning).toBe('off');
  });

  it('no intent at all behaves like `direct`', () => {
    expect(resolveAutoSelection({})).toEqual(resolveAutoSelection({ intent: 'direct' }));
  });
});

/**
 * The invariant that keeps the policy honest: a reasoning setting that the
 * upstream cannot act on is a lie in the table. Small 4 in particular ran with
 * thinking hard-off everywhere before this feature, so grading it up to `low`
 * without registering it as a reasoning lane would have been a silent no-op.
 */
describe('autoPolicy — a non-off reasoning setting is always actionable', () => {
  it.each(ALL_INTENTS)('%s: every graded lane can actually think', (intent) => {
    for (const complexity of COMPLEXITIES) {
      const { modelId, reasoning } = resolveAutoSelection({ intent, complexity });
      if (reasoning === 'off') continue;
      for (const pair of lanePairs(modelId)) {
        expect(
          canActuallyThink(pair.provider, pair.model),
          `${intent}/${complexity} asks for reasoning=${reasoning} on ` +
            `${pair.provider}/${pair.model}, which cannot surface reasoning`
        ).toBe(true);
      }
    }
  });
});

describe('autoPolicy — lane assignment per task shape', () => {
  it('direct answers take the Gemma content lane with reasoning OFF', () => {
    const sel = resolveAutoSelection({ intent: 'direct', complexity: 'simple' });
    expect(sel.modelId).toBe('gemma-litellm');
    expect(sel.reasoning).toBe('off');
  });

  it('real tool/editing work takes the Mistral lane and thinks hard', () => {
    for (const intent of [
      'edit_current_doc',
      'edit_current_board',
      'create_sheet',
      'create_presentation',
    ]) {
      const sel = resolveAutoSelection({ intent, complexity: 'moderate' });
      expect(sel.modelId, intent).toBe('mistral-medium-3.5');
      expect(sel.reasoning, intent).toBe('high');
    }
  });

  it('prose-over-sources takes the Gemma lane', () => {
    for (const intent of ['research', 'search', 'web', 'compare', 'bundestag', 'news']) {
      expect(resolveAutoSelection({ intent }).modelId, intent).toBe('gemma-litellm');
    }
  });

  /**
   * `research_wrapper` was a lane of its own while a research turn only framed
   * a ready-made Linkup answer in two sentences — Small 4, no thinking, because
   * the think lane hit two back-to-back first_token_timeouts on that trivial
   * task. Since the research/web merge the model writes the whole answer from
   * raw sources, so research is ordinary synthesis and shares the web lane.
   */
  it('research writes prose from sources now — same lane as web, never weaker', () => {
    const rank = { off: 0, low: 1, medium: 2, high: 3 } as const;
    for (const complexity of ['simple', 'moderate', 'complex'] as const) {
      const research = resolveAutoSelection({ intent: 'research', complexity });
      const web = resolveAutoSelection({ intent: 'web', complexity });
      // Same writing job, so the same lane. Research may still think harder:
      // its deeper tier hands the model up to twice as many sources.
      expect(research.modelId, complexity).toBe(web.modelId);
      expect(rank[research.reasoning], complexity).toBeGreaterThanOrEqual(rank[web.reasoning]);
    }
  });

  it('short/structured turns take the Gemma content lane', () => {
    // Reporting/summarising over material that is already in context. Folded
    // into the single Gemma 4 (31B) lane on 07.08.2026 — see the lane comment
    // in autoPolicy.ts.
    for (const intent of [
      'mcp',
      'summary',
      'chat_history',
      'scrape_url',
      'chart',
      'bahn',
      'wetter',
      'umfragen',
    ]) {
      expect(resolveAutoSelection({ intent }).modelId, intent).toBe('gemma-litellm');
    }
  });

  it('report-lane intents keep reasoning OFF at every complexity', () => {
    // Load-bearing, not decorative: the lane's current host (Regolo) honours
    // `enable_thinking`, so a graded setting here would actually buy reasoning
    // tokens for turns that only report material already in context.
    for (const intent of [
      'mcp',
      'summary',
      'chat_history',
      'chart',
      'scrape_url',
      'bahn',
      'wetter',
      'hotel',
      'reise',
      'umfragen',
      'hilfe',
    ]) {
      for (const complexity of COMPLEXITIES) {
        expect(
          resolveAutoSelection({ intent, complexity }).reasoning,
          `${intent}/${complexity}`
        ).toBe('off');
      }
    }
  });

  it('compute narrates pre-computed figures on the Mistral lane, not the shared writer', () => {
    // 02.08.2026 incident: the shared writer filled a narration gap with its
    // own arithmetic. Moved off the shared content lane on 07.08.2026 so a
    // future change to that lane can't reintroduce the regression here too.
    for (const complexity of COMPLEXITIES) {
      const sel = resolveAutoSelection({ intent: 'compute', complexity });
      expect(sel.modelId).toBe('mistral-medium-3.5');
      expect(sel.reasoning).toBe('off');
    }
  });

  it('narrating a platform ACTION takes the Mistral lane, not the small one', () => {
    // Measured on the live eval: the small lane AND Gemma answer "ich kann keine
    // Dokumente speichern" while the document is created anyway; Medium
    // narrates it correctly. See the note in autoPolicy.ts.
    for (const intent of ['save_as_doc', 'modify_doc', 'share_doc', 'artifact']) {
      expect(resolveAutoSelection({ intent }).modelId, intent).toBe('mistral-medium-3.5');
    }
  });

  it('artefact-announcement intents never think — the work is already done', () => {
    for (const intent of ['save_as_doc', 'modify_doc', 'share_doc', 'artifact']) {
      for (const complexity of COMPLEXITIES) {
        expect(resolveAutoSelection({ intent, complexity }).reasoning, intent).toBe('off');
      }
    }
  });

  it('sharepic is deliberately absent — its answer text is a fixed template', () => {
    // Falls through to the default rather than pretending the choice matters.
    expect(resolveAutoSelection({ intent: 'sharepic' })).toEqual(
      resolveAutoSelection({ intent: 'not-a-real-intent' })
    );
  });

  /**
   * ...and it is the ONLY one. The table used to be a `Record<string, …>`, so a
   * forgotten intent and a deliberately exempt one were indistinguishable: both
   * silently took DEFAULT_ENTRY, and the suite above still passed, because
   * "resolves to a real lane" is true of the default too. `hilfe` and
   * `create_pdf` sat there unnoticed.
   */
  it('no other intent falls through to the default by accident', () => {
    // Checked on the TABLE KEYS, not by comparing resolved results. The old
    // version resolved an unknown intent and flagged every intent whose result
    // matched — which silently stopped working the moment DEFAULT_ENTRY shared
    // a lane with a real intent. Pointing the default at Gemma 4 (2026-07-31)
    // did exactly that and made `image` and `social_post` look forgotten.
    const exempt: readonly string[] = AUTO_POLICY_EXEMPT;
    const declared = new Set(Object.keys(POLICY));
    const missing = ALL_INTENTS.filter(
      (intent) => !exempt.includes(intent) && !declared.has(intent)
    );
    expect(missing).toEqual([]);
  });

  it('create_pdf sits with its create_* siblings, not on the speed lane', () => {
    // The Lane C note records what the speed lane does to a turn that has to
    // narrate a platform action: "Ich kann keine neuen Dateien … erstellen",
    // while the artefact is created anyway.
    for (const complexity of COMPLEXITIES) {
      expect(resolveAutoSelection({ intent: 'create_pdf', complexity }).modelId).toBe(
        resolveAutoSelection({ intent: 'create_presentation', complexity }).modelId
      );
    }
  });
});

describe('autoPolicy — complexity grading', () => {
  it('grades monotonically: never weaker as complexity rises', () => {
    const rank = { off: 0, low: 1, medium: 2, high: 3 } as const;
    for (const intent of ALL_INTENTS) {
      const [s, m, c] = COMPLEXITIES.map(
        (complexity) => resolveAutoSelection({ intent, complexity }).reasoning
      );
      expect(rank[s!], `${intent} simple→moderate`).toBeLessThanOrEqual(rank[m!]);
      expect(rank[m!], `${intent} moderate→complex`).toBeLessThanOrEqual(rank[c!]);
    }
  });

  it('produktion keeps the lane and grading direct had', () => {
    // The split renamed the verdict, not the work: formulating supplied
    // substance is the same task on the same lane.
    for (const complexity of COMPLEXITIES) {
      expect(resolveAutoSelection({ intent: 'produktion', complexity })).toEqual(
        resolveAutoSelection({ intent: 'direct', complexity })
      );
    }
  });

  it('a complex direct question earns some thought; a greeting does not', () => {
    expect(resolveAutoSelection({ intent: 'direct', complexity: 'simple' }).reasoning).toBe('off');
    expect(resolveAutoSelection({ intent: 'direct', complexity: 'complex' }).reasoning).toBe('low');
    // `greeting` is ungraded on purpose: the complexity detector reads the raw
    // message, and a long-ish "Guten Morgen, wie geht es dir denn heute?" can
    // grade `moderate` — which would buy reasoning tokens for "Hallo".
    for (const complexity of COMPLEXITIES) {
      const sel = resolveAutoSelection({ intent: 'greeting', complexity });
      expect(sel.reasoning, complexity).toBe('off');
      expect(sel.modelId, complexity).toBe(
        resolveAutoSelection({ intent: 'direct', complexity: 'simple' }).modelId
      );
    }
  });

  it('grading never changes the lane, only the effort', () => {
    for (const intent of ALL_INTENTS) {
      const lanes = new Set(
        COMPLEXITIES.map((complexity) => resolveAutoSelection({ intent, complexity }).modelId)
      );
      expect(lanes.size, intent).toBe(1);
    }
  });
});

describe('autoPolicy — agent routing hint', () => {
  const CREATIVE_AGENT = 'gruenerator-rede-schreiber'; // autoRoutingHint: 'creative'
  const PRECISE_AGENT = 'gruenerator-bundestag'; // autoRoutingHint: 'precise'

  it('the precise hint overrides the lane on shape-less intents', () => {
    expect(resolveAutoSelection({ intent: 'direct', agentId: PRECISE_AGENT }).modelId).toBe(
      'mistral-medium-3.5'
    );
  });

  it('the creative hint is currently a no-op — every shape-less intent already defaults to Gemma', () => {
    // Documents intent, not a real override: since the 07.08.2026 lane fold,
    // GEMMA is what a shape-less intent resolves to with NO agent at all, so
    // this assertion would pass identically with the 'creative' branch deleted
    // from resolveAutoSelection. Kept as a tripwire — if a future
    // HINT_OVERRIDABLE intent's default stops being GEMMA, this test should
    // start failing and prompt re-adding a real branch.
    expect(resolveAutoSelection({ intent: 'direct', agentId: CREATIVE_AGENT }).modelId).toBe(
      resolveAutoSelection({ intent: 'direct' }).modelId
    );
  });

  it('does NOT override an intent that already has a task shape', () => {
    const sel = resolveAutoSelection({ intent: 'create_sheet', agentId: CREATIVE_AGENT });
    expect(sel.modelId).toBe('mistral-medium-3.5');
  });

  it('leaves the reasoning grading untouched', () => {
    const withAgent = resolveAutoSelection({
      intent: 'direct',
      complexity: 'complex',
      agentId: CREATIVE_AGENT,
    });
    const without = resolveAutoSelection({ intent: 'direct', complexity: 'complex' });
    expect(withAgent.reasoning).toBe(without.reasoning);
  });

  it('an unknown agent id is ignored rather than fatal', () => {
    expect(resolveAutoSelection({ intent: 'direct', agentId: 'nope' }).modelId).toBe(
      'gemma-litellm'
    );
  });
});

/**
 * Regression guard for a bug the live provider test caught: the policy's
 * four-step scale is wider than what @ai-sdk/mistral accepts. Sending 'low' or
 * 'medium' to it throws a ZodError ("expected one of high|none"), so every
 * Mistral-lane setting MUST pass through the collapsing helper first.
 */
describe('autoPolicy — Mistral has a binary dial', () => {
  it('collapses the scale to what the SDK actually validates', () => {
    expect(mistralReasoningOption('off')).toBeNull();
    expect(mistralReasoningOption('low')).toBeNull();
    expect(mistralReasoningOption('medium')).toBe('high');
    expect(mistralReasoningOption('high')).toBe('high');
  });

  it('never yields a value the Mistral SDK would reject', () => {
    const ACCEPTED = new Set(['high', 'none']);
    for (const intent of [...ALL_INTENTS, undefined]) {
      for (const complexity of COMPLEXITIES) {
        for (const surface of [undefined, 'notebook' as const]) {
          const sel = resolveAutoSelection({ intent, complexity, surface });
          const pairs = lanePairs(sel.modelId);
          if (!pairs.some((p) => p.provider === 'mistral')) continue;
          const sent = mistralReasoningOption(sel.reasoning);
          if (sent !== null) {
            expect(ACCEPTED.has(sent), `${intent}/${complexity} → ${sent}`).toBe(true);
          }
        }
      }
    }
  });
});

describe('autoPolicy — classifier-less surfaces', () => {
  it('notebook pins the precise lane regardless of intent', () => {
    for (const intent of ['direct', 'search', undefined]) {
      const sel = resolveAutoSelection({ intent, surface: 'notebook' });
      expect(sel.modelId, String(intent)).toBe('mistral-medium-3.5');
    }
  });

  it('notebook still grades reasoning by complexity', () => {
    expect(resolveAutoSelection({ surface: 'notebook', complexity: 'simple' }).reasoning).toBe(
      'low'
    );
    expect(resolveAutoSelection({ surface: 'notebook', complexity: 'complex' }).reasoning).toBe(
      'high'
    );
  });
});

describe('autoPolicy — taskShape override', () => {
  it('routes neutral intents with an output contract to the precise lane', () => {
    for (const intent of ['produktion', 'direct', 'agentic'] as const) {
      expect(resolveAutoSelection({ intent, taskShape: 'code' }).modelId).toBe(
        'mistral-medium-3.5'
      );
      expect(resolveAutoSelection({ intent, taskShape: 'strict_format' }).modelId).toBe(
        'mistral-medium-3.5'
      );
    }
  });

  it('leaves non-neutral intents on their table lane', () => {
    // A search turn with a JSON wish still answers over sources on its lane;
    // pinned tool intents are already precise.
    expect(resolveAutoSelection({ intent: 'web', taskShape: 'code' }).modelId).toBe(
      'gemma-litellm'
    );
    expect(resolveAutoSelection({ intent: 'create_sheet', taskShape: 'code' }).modelId).toBe(
      'mistral-medium-3.5'
    );
  });

  it('beats a creative agent hint — format fidelity over voice', () => {
    // gruenerator-universal has no hint; use the shape override on top of the
    // hint path via an agent that hints creative, if configured. The contract
    // is positional: taskShape applies AFTER the hint.
    const selection = resolveAutoSelection({
      intent: 'produktion',
      agentId: 'gruenerator-universal',
      taskShape: 'code',
    });
    expect(selection.modelId).toBe('mistral-medium-3.5');
  });

  it('no shape → unchanged speed lane', () => {
    expect(resolveAutoSelection({ intent: 'produktion' }).modelId).toBe('gemma-litellm');
  });
});

describe('resolveAutoSelection — carried material', () => {
  // The signal that needs no wording. Measured 13.08.2026: a 10.149-char
  // article, pasted once and carried into three follow-up turns.
  const ARTICLE = 10_149;

  it('routes document work to the precise lane', () => {
    expect(resolveAutoSelection({ intent: 'agentic', materialChars: ARTICLE }).modelId).toBe(
      'mistral-medium-3.5'
    );
    expect(resolveAutoSelection({ intent: 'produktion', materialChars: ARTICLE }).modelId).toBe(
      'mistral-medium-3.5'
    );
  });

  it('turns reasoning on, which the intent table never did', () => {
    // `agentic` carries a flat 'low' that no complexity staffing touches — all
    // four turns of the live run were graded 'low', two of them at
    // complexity=complex, and the model then rated 8/8 paragraphs "vollständig"
    // and missed a modality shift.
    expect(resolveAutoSelection({ intent: 'agentic', complexity: 'complex' }).reasoning).toBe(
      'low'
    );
    expect(
      resolveAutoSelection({ intent: 'agentic', complexity: 'complex', materialChars: ARTICLE })
        .reasoning
    ).toBe('medium');
  });

  it('never lowers reasoning an intent already asked for', () => {
    const withMaterial = resolveAutoSelection({
      intent: 'produktion',
      complexity: 'complex',
      agentId: 'gruenerator-universal',
      materialChars: ARTICLE,
    });
    expect(withMaterial.reasoning).not.toBe('off');
  });

  it('a short quote is not document work', () => {
    // A pasted sentence must not move the whole turn to the slow lane.
    expect(resolveAutoSelection({ intent: 'produktion', materialChars: 400 }).modelId).toBe(
      'gemma-litellm'
    );
    expect(resolveAutoSelection({ intent: 'produktion', materialChars: 2_999 }).modelId).toBe(
      'gemma-litellm'
    );
    expect(resolveAutoSelection({ intent: 'produktion', materialChars: 3_000 }).modelId).toBe(
      'mistral-medium-3.5'
    );
  });

  it('leaves pinned tool intents alone', () => {
    // Same scope as the shape and hint overrides.
    expect(resolveAutoSelection({ intent: 'web', materialChars: ARTICLE }).modelId).toBe(
      'gemma-litellm'
    );
  });

  it('needs no taskShape to fire — that is the point', () => {
    // The wording-based detector could only ever recognise the phrasings it was
    // built against. This one reads a length.
    const selection = resolveAutoSelection({
      intent: 'agentic',
      complexity: 'moderate',
      materialChars: ARTICLE,
    });
    expect(selection.modelId).toBe('mistral-medium-3.5');
    expect(selection.reasoning).toBe('medium');
  });
});

describe('resolveAutoSelection — Pipeline-Agenten', () => {
  // Der Lauf, der diese Regel erzwungen hat: 5.838 Zeichen Fachtext an den
  // Agenten „Einfache Sprache". Material-Regel + `autoRoutingHint: 'precise'`
  // ergaben mistral-medium-3.5 mit reasoning=medium — auf Mistral binär, also
  // volles Denken. Drei Minuten Denken, kein Antwort-Token, Turn verloren.
  const ES = 'gruenerator-einfache-sprache';
  const MATERIAL = 5_838;

  it('bleibt auf Gemma 4, auch mit Material und precise-Hint', () => {
    const selection = resolveAutoSelection({
      intent: 'produktion',
      complexity: 'moderate',
      agentId: ES,
      materialChars: MATERIAL,
    });
    expect(selection.modelId).toBe('gemma-litellm');
    // Denken versuchsweise aus (14.08.2026): auf dieser Lane kam es in keinem
    // gemessenen Lauf durch, jeder endete im Rückfall „zweiter Versuch ohne
    // Denken". Was der Test festhält, ist die Lane und ihre Unverdrehbarkeit —
    // der Reasoning-Wert ist hier bewusst mitgeprüft, damit ein Zurückdrehen
    // eine sichtbare Entscheidung bleibt und kein Nebeneffekt.
    expect(selection.reasoning).toBe('off');
  });

  it('lässt sich auch von taskShape nicht wegdrehen', () => {
    expect(
      resolveAutoSelection({ intent: 'produktion', agentId: ES, taskShape: 'strict_format' })
        .modelId
    ).toBe('gemma-litellm');
  });

  it('ein gewöhnlicher Agent mit demselben Material bleibt auf der präzisen Lane', () => {
    // Die Material-Regel ist NICHT zurückgenommen, sie gilt nur nicht für die
    // Agenten, die ihre Prüfung selbst mitbringen.
    const selection = resolveAutoSelection({
      intent: 'produktion',
      complexity: 'moderate',
      agentId: 'gruenerator-universal',
      materialChars: MATERIAL,
    });
    expect(selection.modelId).toBe('mistral-medium-3.5');
    expect(selection.reasoning).toBe('medium');
  });
});
