/**
 * Shared shapes for the deep research agent.
 *
 * Kept free of imports from the agent runtime so the turn module and the tests
 * can talk about a run without pulling `deepagents` into their graph.
 */

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
  /** Epoch ms after which tools refuse new work so the report can be written. */
  softDeadlineAt: number;
}

/** One source the run actually looked at, for the report's `## Quellen` list. */
export interface SourceRef {
  url: string;
  title: string;
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
  softMs: 5 * 60_000,
  hardMs: 7 * 60_000,
  recursionLimit: 60,
} as const;

export function createBudget(now: number, softMs: number = DEFAULT_BUDGET.softMs): RunBudget {
  return {
    searchesLeft: DEFAULT_BUDGET.searches,
    deepSearchesLeft: DEFAULT_BUDGET.deepSearches,
    crawlsLeft: DEFAULT_BUDGET.crawls,
    softDeadlineAt: now + softMs,
  };
}
