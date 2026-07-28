import { searchIntentSchema } from '@gruenerator/contracts';
import { describe, it, expect } from 'vitest';

import { isReasoningCapable } from '../../../services/ai/modelDiscovery.js';
import { isReasoningStreamModel } from '../../../services/ai/regoloReasoningStream.js';
import { mistralReasoningOption } from '../services/responseStreamingService.js';

import { resolveAutoSelection, type Complexity } from './autoPolicy.js';
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

  it('an unknown intent falls back to the speed lane instead of throwing', () => {
    const sel = resolveAutoSelection({ intent: 'not-a-real-intent' });
    expect(sel.modelId).toBe('litellm');
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
  it('direct answers take the speed lane with reasoning OFF', () => {
    const sel = resolveAutoSelection({ intent: 'direct', complexity: 'simple' });
    expect(sel.modelId).toBe('litellm');
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

  it('short/structured turns take the Small 4 lane', () => {
    // Reporting/summarising over material that is already in context.
    for (const intent of [
      'mcp',
      'summary',
      'chat_history',
      'scrape_url',
      'compute',
      'chart',
      'bahn',
      'wetter',
      'umfragen',
    ]) {
      expect(resolveAutoSelection({ intent }).modelId, intent).toBe('mistral-small-4');
    }
  });

  it('narrating a platform ACTION takes the Mistral lane, not the small one', () => {
    // Measured on the live eval: Small 4 AND Gemma answer "ich kann keine
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

  it('a complex direct question earns some thought; a greeting does not', () => {
    expect(resolveAutoSelection({ intent: 'direct', complexity: 'simple' }).reasoning).toBe('off');
    expect(resolveAutoSelection({ intent: 'direct', complexity: 'complex' }).reasoning).toBe('low');
  });

  it('the Small 4 lane never thinks — measured, not assumed', () => {
    // Live probe: thinking is correct but costs ~1.6–2k chars of reasoning on a
    // trivial question, `low` barely reduces it (no native dial), and a small
    // token budget was consumed entirely by reasoning → empty answer. Too
    // expensive for the lane chosen FOR speed. See the note in autoPolicy.ts.
    for (const intent of ALL_INTENTS) {
      for (const complexity of COMPLEXITIES) {
        const sel = resolveAutoSelection({ intent, complexity });
        if (sel.modelId !== 'mistral-small-4') continue;
        expect(sel.reasoning, `${intent}/${complexity}`).toBe('off');
      }
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

  it('overrides the lane on shape-less intents', () => {
    expect(resolveAutoSelection({ intent: 'direct', agentId: CREATIVE_AGENT }).modelId).toBe(
      'gemma-litellm'
    );
    expect(resolveAutoSelection({ intent: 'direct', agentId: PRECISE_AGENT }).modelId).toBe(
      'mistral-medium-3.5'
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
    expect(resolveAutoSelection({ intent: 'direct', agentId: 'nope' }).modelId).toBe('litellm');
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
