/**
 * Request-scoped record of the decisions a chat turn made.
 *
 * The SSE wire already shows WHAT happened: the final intent, every tool call,
 * degradation warnings, artifacts. What it cannot show is WHY — which guard
 * fired, which conjunct closed a gate, why the classifier demoted, which of
 * three silent answer-substitutions in the loop took effect. Those are the
 * decisions the expensive bugs lived in, and from outside they are invisible.
 *
 * Same idiom as `usageContext.ts`: an AsyncLocalStorage store, so nothing has
 * to be threaded through the 2306-line router. With no recorder bound —
 * i.e. in production, always — `recordDecision` is one `getStore()` and a
 * return. Nothing is logged, serialised or written; truncation and redaction
 * belong to whoever renders the journal, never to the recording site.
 *
 * There is deliberately NO way to switch this on in production. The one sink
 * that exists (`decisionLog.ts`) is gated on `NODE_ENV === 'development'` and
 * checked at construction, so in a production build the middleware is never
 * created and no request ever binds a journal. That gate, not the absence of a
 * flag, is what keeps this free: every site here already sits next to a
 * `log.info`, and the per-turn array is what a production deployment must not
 * start paying for by accident.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The closed set of decision points. Closed, not free strings, for three
 * reasons that each pay for themselves:
 *
 *  1. `chose` is typed as `BranchOf<P>`, so a wrong branch label is a COMPILE
 *     error — and production files, unlike the vitest ones, are typechecked.
 *  2. The simulation scenarios derive their point enum from this object, so a
 *     typo in a scenario fails at LOAD time. That exact failure has been paid
 *     for once already: `evals/types.ts` records a mistyped `expect` key that
 *     "silently became `undefined`, the assertion it was meant to drive never
 *     ran, and the scenario reported green having asserted nothing".
 *  3. "Guard X stopped firing" is only detectable if the guards are
 *     ENUMERABLE — the renderer prints every point below, including the ones a
 *     turn never reached. You cannot notice the absence of something you never
 *     knew existed.
 *
 * The ids appear in committed decision maps, which makes them F1 (internally
 * frozen, see CLAUDE.md): rename via a comment here, never via a migration.
 * They are deliberately NOT a `z.enum` in `@gruenerator/contracts` — they cross
 * no wire, and putting them there would invite emitting them, turning
 * instrumentation into a public API.
 */
export const DECISION_POINTS = {
  /** Loop vs. single-pass. The highest fan-in decision in the chat stack. */
  'router.run_agentic': { branches: ['loop', 'single_pass'] },

  /** The router overruling the classifier. The wire shows only the result. */
  'router.intent_override': {
    branches: [
      'sharepic_unlicensed_to_direct',
      'sharepic_unlicensed_fixed_text',
      'modify_board_to_agentic',
      'agentic_to_search',
      'system_tool_to_web',
    ],
  },

  /** "…aber erstelle kein Dokument." — the negative-action gate. */
  'router.persistent_action_gate': {
    branches: ['allowed', 'dropped_secondary', 'demoted_primary_to_direct'],
  },

  /** Which classifier tier produced the verdict. */
  'classifier.tier': {
    branches: [
      'tier2.7_mcp_followup',
      'tier2.7_sharepic_followup',
      'tier2.9_docs_help',
      'tier2.95_ambiguous_graphic',
      'tier3_short_message',
      'tier3_heuristic',
      'tier3.4_chat_recall',
      'tier3.4_recurring_order',
      'tier3.5_loop_demotion',
      'tier3.7_source_scope',
      'tier3.7_no_live_source',
      'tier4_llm',
      'tier4_llm_error_fallback',
    ],
  },

  /**
   * Which length/structure rule the answer prompt carried.
   *
   * Invisible from outside by construction: the wire shows a short answer, and
   * a short answer because the model had little to say is indistinguishable
   * from a short answer because the prompt capped it at two paragraphs. That
   * ambiguity hid a real defect — question LENGTH was standing in for answer
   * SCOPE, so "wer war marilyn monroe" was capped while the same question with
   * "ausführlich" appended was not.
   */
  'respond.answer_format': {
    branches: [
      'brief',
      'standard',
      'structured_headings',
      'research_expanded',
      // The turn's shape is prescribed elsewhere in the SAME prompt — by a
      // synthesis mode or by an intent whose guidance block owns the output
      // format. This rule then points at that block instead of adding a second
      // directive on the same axis; `inputs.formatOwner` names the owner.
      //
      // Replaces `synthesis_brief`/`synthesis_full`, which WERE that second
      // directive: a `table` synthesis was told "Kurze, präzise Antworten"
      // right next to a prescription for a 3–6-dimension comparison table.
      'own_format',
    ],
  },

  /** A tool call the loop refused. Blocks only — a call that RAN is already
   *  on the wire as `tool_step_start`. Journal what the wire cannot see. */
  'loop.tool_guard': {
    branches: [
      'duplicate',
      'near_duplicate',
      'failure_cap',
      'failure_budget',
      'search_budget',
      'search_concurrency',
    ],
  },

  /** The loop silently replacing its own answer. The wire shows only the
   *  replacement, so a wrongly swapped answer looks exactly like a correct one. */
  'loop.synth_verdict': {
    branches: ['accepted', 'refusal_swapped', 'degenerate_retried', 'retry_failed_empty'],
  },
} as const satisfies Record<string, { readonly branches: readonly string[] }>;

export type DecisionPointId = keyof typeof DECISION_POINTS;
/**
 * Exported so a call site that funnels several branches through one local helper
 * can type that helper against the registry instead of casting. A cast there
 * would reopen exactly the hole this registry exists to close — a wrong branch
 * label silently accepted.
 */
export type BranchOf<P extends DecisionPointId> = (typeof DECISION_POINTS)[P]['branches'][number];

/**
 * Flat on purpose. Nested objects and arrays-of-objects do not diff usefully,
 * and a decision map is read as a diff or not at all.
 */
export type DecisionInputs = Record<string, string | number | boolean | null | readonly string[]>;

export interface DecisionEntry {
  point: DecisionPointId;
  chose: string;
  because?: string;
  inputs?: DecisionInputs;
  /** Insertion order. A tie-breaker only — the renderer sorts by point. */
  seq: number;
}

export interface DecisionJournal {
  entries: DecisionEntry[];
  overflowed: boolean;
}

const store = new AsyncLocalStorage<DecisionJournal>();

/** Guards against a pathological loop turning the journal into a memory leak. */
const MAX_ENTRIES = 500;

export function createDecisionJournal(): DecisionJournal {
  return { entries: [], overflowed: false };
}

export function runWithDecisionJournal<T>(journal: DecisionJournal, fn: () => T): T {
  return store.run(journal, fn);
}

export function getDecisionJournal(): DecisionJournal | null {
  return store.getStore() ?? null;
}

/** True only while a recorder is bound — for the rare site where building
 *  `inputs` would itself cost work. Most sites need no guard. */
export function isRecordingDecisions(): boolean {
  return store.getStore() !== undefined;
}

export function recordDecision<P extends DecisionPointId>(
  point: P,
  chose: BranchOf<P>,
  detail?: { because?: string; inputs?: DecisionInputs }
): void {
  const journal = store.getStore();
  if (journal === undefined) return;
  if (journal.entries.length >= MAX_ENTRIES) {
    journal.overflowed = true;
    return;
  }
  journal.entries.push({ point, chose, ...detail, seq: journal.entries.length });
}
