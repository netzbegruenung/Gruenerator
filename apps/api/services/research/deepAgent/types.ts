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
  /** Where it came from when there is no URL, e.g. `Notizbuch: Berlin`. */
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
  aiWorkerPool?: unknown;
  /**
   * Which Grünerator notebooks this run may look into. Omitted or null means the
   * notebook tool is not offered at all.
   */
  notebookScope?: NotebookScope;
  /** Aborts the run. The caller owns the hard deadline. */
  signal?: AbortSignal;
}

export interface DeepAgentRunResult {
  /** The report as markdown, `## Quellen` guaranteed present. */
  markdown: string;
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
 * capped at two while ordinary searches get twelve. Linkup's `/v1/research`
 * endpoint (~3 EUR per prompt) is deliberately not reachable from this agent at
 * all — see tools.ts.
 */
export const DEFAULT_BUDGET = {
  searches: 12,
  deepSearches: 2,
  crawls: 8,
  crawlRefunds: 4,
  notebookSearches: 8,
  softMs: 5 * 60_000,
  hardMs: 7 * 60_000,
  recursionLimit: 60,
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
