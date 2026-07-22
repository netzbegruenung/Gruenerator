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
  /** MCP connector server title (e.g. "Notion"). Present only for MCP tool
   *  steps; lets a later turn identify + replay which server was used, since
   *  the `m<serverKey>__` tool name alone isn't human-readable. */
  serverName?: string;
}

/**
 * What an MCP connector tool call yields: EITHER text content OR an error
 * string — never both. `mcpCatalog.ts`'s `dynamicTool` returns exactly this
 * shape (`{ content } | { error }`), so it is the contract the split synth
 * relays from and reports on. A discriminated union (not a loose bag) so the
 * relay code can't silently confuse "the connector returned an empty string"
 * with "there is no content field" — the exact ambiguity behind a synth that
 * falsely claims "kein Zugriff" after a tool ran OK.
 */
export type McpToolResult = { content: string } | { error: string };

/** Normalized read of a persisted step's result as an MCP outcome. */
export interface McpResultView {
  ok: boolean;
  /** The (possibly empty) text the connector returned. '' when `ok` is false. */
  content: string;
  /** The error text when `ok` is false; null otherwise. */
  error: string | null;
}

/**
 * Read a persisted step's `result` as an MCP outcome. Tolerant of the untyped
 * `Record<string, unknown>` persistence shape (results are stored generically
 * across all tool families), but funnels every MCP consumer through ONE reader
 * so "empty content" vs "error" vs "missing field" is decided in a single place.
 */
export function readMcpResult(result: Record<string, unknown> | undefined): McpResultView {
  const err = result?.error;
  if (err != null && err !== '') return { ok: false, content: '', error: String(err) };
  const raw = result?.content;
  const content = raw == null ? '' : typeof raw === 'string' ? raw : JSON.stringify(raw);
  return { ok: true, content, error: null };
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
