/**
 * Shared types for the agentic chat tool loop (Phase 0 plumbing).
 *
 * Kept dependency-light so unit tests and the wire/persistence layers can import
 * these without pulling in the AI SDK, providers, or the DB. The loop substrate
 * itself (agenticRespondService, Phase 1) builds on top of these.
 */

/**
 * One executed tool step, persisted on the assistant message as `toolCalls` and
 * rehydrated by the frontend thread-reload conversion. Shape matches what the
 * sharepic loop already persists (see sharepicAgenticService) so the existing
 * tool-ui renderers and `threadMessageConversion` keep working unchanged.
 */
export interface PersistedStep {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

/** Bounds for a single loop turn. */
export interface LoopBudget {
  /** Max LLM steps (each tool round trip is one step). */
  maxSteps: number;
  /** Wall-clock budget for the whole turn. */
  wallClockMs: number;
  /** Per tool-call execution timeout. */
  perCallTimeoutMs: number;
}

/** Per-turn counters for observability / cost telemetry. */
export interface LoopTelemetry {
  steps: number;
  toolCalls: number;
  failures: number;
  /** True when the step/wall-clock budget forced the final answer. */
  budgetHit: boolean;
}

export const DEFAULT_LOOP_BUDGET: LoopBudget = {
  // 8 leaves room for a multi-topic turn (up to 6 searches, MAX_SEARCH_CALLS)
  // plus a step to answer, without force-finishing mid-coverage.
  maxSteps: 8,
  wallClockMs: 120_000,
  perCallTimeoutMs: 20_000,
};
