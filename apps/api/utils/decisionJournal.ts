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
 * There is deliberately NO env flag to switch this on in production: that would
 * mean an unbounded per-request array, and every site here already sits next to
 * a `log.info`.
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
      'tier2.9_docs_help',
      'tier2.95_ambiguous_graphic',
      'tier3_short_message',
      'tier3_heuristic',
      'tier3.5_loop_demotion',
      'tier4_llm',
      'tier4_llm_error_fallback',
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
type BranchOf<P extends DecisionPointId> = (typeof DECISION_POINTS)[P]['branches'][number];

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
