/**
 * Shared shapes for the deep research agent.
 *
 * Kept free of imports from the agent runtime so the turn module and the tests
 * can talk about a run without pulling `deepagents` into their graph.
 */

// Type-only, so the cycle with notebookScope.ts is erased at compile time.
import { type NotebookScope } from './notebookScope.js';

/** Locale the run reports in. Austria is a first-class audience, not a toggle. */
export type ResearchLocale = 'de-DE' | 'de-AT';

/**
 * What a run may spend before its tools start refusing.
 *
 * A budget rather than a wall clock alone: the expensive part of a research run
 * is the paid search, not the elapsed time, and a run that stalls on one slow
 * crawl should still be allowed to finish its report.
 */
export interface RunBudget {
  /** Cheap searches (GreenPT, falling back to Linkup `standard`). */
  searchesLeft: number;
  /** Linkup `deep` calls. The costly lane — see DEFAULT_BUDGET. */
  deepSearchesLeft: number;
  /** Page crawls. */
  crawlsLeft: number;
  /**
   * How many FAILED crawls get their unit refunded. A crawl costs no external
   * money, only time — so a run whose sources happen to 503 (observed 11.08.2026
   * with a whole domain down) should not burn its reading allowance on nothing.
   * Capped so a model stuck on one dead site cannot crawl forever; paid search
   * failures are deliberately NOT refunded, the provider may bill the attempt.
   */
  crawlRefundsLeft: number;
  /**
   * Grünerator notebook searches. Counted apart from `searchesLeft` because they
   * cost a Qdrant query and an embedding, nothing else — letting them eat the
   * twelve paid web searches would make the cheap lane the scarce one.
   */
  notebookSearchesLeft: number;
  /** Epoch ms after which tools refuse new work so the report can be written. */
  softDeadlineAt: number;
}

/**
 * One source the run actually looked at, for the report's `## Quellen` list.
 *
 * `url` may be empty: a document inside a personal notebook usually has no
 * public address. Such a source is named by `origin` instead — inventing a
 * `/office/<id>` link would be worse than none, because a Qdrant `document_id`
 * is not guaranteed to be a `collaborative_documents` row and `outputSanity`
 * strips unminted artifact paths back out of model text anyway.
 */
export interface SourceRef {
  url: string;
  title: string;
  /** Where it came from when there is no URL, e.g. `Notebook: Berlin`. */
  origin?: string;
}

/** A step the user sees in the sidebar while the run is in flight. */
export interface ResearchStep {
  id: string;
  label: string;
  status: 'running' | 'done' | 'failed';
}

export interface DeepAgentProgress {
  /** Replaces the step with the same id, appends when it is new. */
  onStep: (step: ResearchStep) => void;
  /** Plan items from `write_todos`, mapped to the same step shape. */
  onPlan: (steps: ResearchStep[]) => void;
}

export interface DeepAgentRunParams {
  question: string;
  locale: ResearchLocale;
  progress: DeepAgentProgress;
  /** Passed through to the distiller so crawls reuse the app's model lanes. */
  /**
   * Which Grünerator notebooks this run may look into. Omitted or null means the
   * notebook tool is not offered at all.
   */
  notebookScope?: NotebookScope;
  /**
   * Whose run this is — used only to attribute the Langfuse trace, so a slow or
   * failed research can be found from a support request instead of by grepping.
   * Omitted means an unattributed trace, not a disabled one.
   */
  userId?: string;
  /**
   * Checkpoint key. Omitted means a fresh one per run — pass an existing id to
   * continue a research whose process died.
   */
  threadId?: string;
  /** Aborts the run. The caller owns the hard deadline. */
  signal?: AbortSignal;
}

export interface DeepAgentRunResult {
  /** The report as markdown, `## Quellen` guaranteed present. */
  markdown: string;
  /**
   * The checkpoint key this run wrote under. Store it and a later run can be
   * handed it back; without a checkpointer it is a label and nothing more.
   */
  threadId: string;
  /** H1 of the report, used as the document title. */
  title: string;
  /** Two or three sentences for the chat message. */
  summary: string;
  /** True when the run was cut short and the report is a draft. */
  partial: boolean;
  sources: SourceRef[];
}

/**
 * Ceilings for one run.
 *
 * `deepSearches` is the number that matters for the bill: Linkup's `deep` depth
 * is the only lane here that costs meaningfully more than a cent, so it is
 * capped at two while ordinary searches get two dozen. Linkup's `/v1/research`
 * endpoint (~3 EUR per prompt) is deliberately not reachable from this agent at
 * all — see tools.ts.
 *
 * ── Why the numbers grew on 11.08.2026 ────────────────────────────────────
 *
 * The old ceilings described a seven-minute run, and the result read like one:
 * eight pages read, and a report the log calls a `Teilbericht` because the hard
 * deadline landed mid-sentence. This turn is allowed to take ten to fifteen
 * minutes — the user is told so before it starts and gets a document, not a
 * chat reply. Searches are cheap by design (GreenPT first, and it now waits for
 * its rate gate instead of dropping to Linkup — see tools.ts), so the binding
 * constraint is wall-clock, and that is what these clocks spend.
 *
 * The three clocks are distinct on purpose:
 *
 *  - `softMs` — tools stop accepting research; the model still has time to write.
 *  - `hardMs` — the research legs are aborted. NOT the end of the run.
 *  - `wrapUpMs` — a fresh short leg whose only job is writing `/bericht.md` from
 *    what was gathered. Before it, the hard deadline killed the run wherever it
 *    stood, which is how a run with 83 sources in hand ended as a fragment.
 */
export const DEFAULT_BUDGET = {
  searches: 24,
  deepSearches: 2,
  crawls: 20,
  crawlRefunds: 8,
  notebookSearches: 12,
  softMs: 11 * 60_000,
  hardMs: 13 * 60_000,
  wrapUpMs: 2 * 60_000,
  recursionLimit: 160,
} as const;

export function createBudget(now: number, softMs: number = DEFAULT_BUDGET.softMs): RunBudget {
  return {
    searchesLeft: DEFAULT_BUDGET.searches,
    deepSearchesLeft: DEFAULT_BUDGET.deepSearches,
    crawlsLeft: DEFAULT_BUDGET.crawls,
    crawlRefundsLeft: DEFAULT_BUDGET.crawlRefunds,
    notebookSearchesLeft: DEFAULT_BUDGET.notebookSearches,
    softDeadlineAt: now + softMs,
  };
}
