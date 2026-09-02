/**
 * Shared types for the agentic chat tool loop (Phase 0 plumbing).
 *
 * Kept dependency-light so unit tests and the wire/persistence layers can import
 * these without pulling in the AI SDK, providers, or the DB. The loop substrate
 * itself (agenticRespondService, Phase 1) builds on top of these.
 */

/**
 * One executed tool step, persisted on the assistant message as `toolCalls` and
 * rehydrated by the frontend thread-reload conversion. Shape is what the
 * tool-ui renderers and `threadMessageConversion` already expect.
 */
export interface PersistedStep {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  /** Set ONLY on failure. The live card learns the outcome from the
   *  `tool_step_result` event's `ok` flag, which was never persisted — so a
   *  failed connector call came back GREEN after a thread reload. Absent means
   *  "succeeded", which keeps every pre-existing thread reading correctly. */
  ok?: false;
  /** MCP connector server title (e.g. "Notion"). Present only for MCP tool
   *  steps; lets a later turn identify + replay which server was used, since
   *  the `m<serverKey>__` tool name alone isn't human-readable. */
  serverName?: string;
  /** Character index into the FINAL answer text at the moment this tool call
   *  started — lets thread reload interleave text segments and tool cards in
   *  the live order. Monotonically non-decreasing across a turn's steps. Only
   *  set in unified mode; absent on legacy messages, split-mode turns, and
   *  after a citation clamp rewrote the text (offset drift protection). */
  textOffset?: number;
  /** Planner announcement sentence(s) streamed before this tool call started
   *  (split-gather mode only). Rendered as muted text above the card and
   *  persisted with the turn; never replayed into model context. */
  narration?: string;
}

/** Herkunft eines Konnektor-Werkzeugs, soweit die Freigabe sie unterscheidet. */
export interface ToolOrigin {
  /** `mcp` = von der Nutzer*in verbunden, `managed` = von uns betrieben. */
  kind: 'mcp' | 'managed';
  /** `mcp_servers.id` bzw. der Systemschlüssel des betriebenen Servers. */
  serverId: string;
  /** Der Werkzeugname am Server — nicht der Katalogschlüssel `m<key>__<tool>`. */
  remoteToolName: string;
  /**
   * `annotations.readOnlyHint`, so wie der Server ihn geschickt hat — eine
   * BEHAUPTUNG, keine Tatsache. Wird hier ungefiltert durchgereicht; ob sie
   * zählt, entscheidet allein `approvalPolicy.ts` (und dort nur für
   * `kind: 'managed'`). Fehlt = der Server hat nichts gesagt, nicht `false`.
   */
  readOnlyHint?: boolean;
}

/** Anzeigename eines Konnektor-Werkzeugs plus seine Herkunft. */
export interface ToolLabel {
  serverName: string;
  toolName: string;
  origin?: ToolOrigin;
}

/**
 * Ein Werkzeugaufruf, der auf die Freigabe der Nutzer*in wartet. Trägt alles,
 * was die Karte zeigt und was die Fortsetzung braucht — beim Entscheiden ist
 * der Zug beendet, es steht also nichts mehr im Speicher.
 */
export interface PendingToolCall {
  toolCallId: string;
  /** Katalogschlüssel, bei MCP also der Namensraum-Name `m<key>__<tool>`. */
  toolName: string;
  args: Record<string, unknown>;
  /** Schlüssel der dauerhaften Freigabe — siehe `approvalPolicy.ts`. */
  scopeKey: string;
  title?: string;
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
  /**
   * Budget for the TOOL work — searching, scraping, generating artifacts.
   *
   * SOFT: spending it strips the tools and tells the model to answer with what
   * it has (the same door `forceFinish` already opens on the step limit). It
   * used to be a hard `AbortSignal.timeout` over the whole turn, which meant it
   * could fire while the answer was being written: the stream was torn down
   * mid-word and the stump shipped as if it were the finished answer. Observed
   * live on both turns of a QA session that created an artifact first — a sheet
   * or PDF eats 30–60s here, so the writer started with the clock nearly spent.
   */
  wallClockMs: number;
  /**
   * Absolute ceiling for the turn — the only HARD abort left. Deliberately far
   * above `wallClockMs`: it exists so a wedged provider cannot hang a request
   * forever, not to pace the answer. Writing is guarded by its own idle
   * deadline (SYNTH_IDLE_DEADLINE_MS), which catches a dead lane in 20s without
   * punishing a slow but live one.
   */
  hardCapMs: number;
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
  hardCapMs: 300_000,
  perCallTimeoutMs: 20_000,
};

/**
 * Tools whose honest runtime does not fit the generic per-call budget.
 *
 * `research` runs a multi-source deep pass (planning → several searches →
 * synthesis) and was measured live at 16.5s — only 3.5s under the generic 20s
 * cap. Under load that cap kills a legitimate research call, and the turn sees
 * it merely as "tool failed", so the answer silently loses its sources.
 *
 * Raised for these tools ALONE, not globally: the generic 20s is what keeps a
 * hung backend from eating the whole turn, and `maxSteps` × 30s would exceed
 * the wall clock. The wall clock stays the outer bound either way.
 *
 * The generation tools are the second class, and for them 20s was never
 * reachable: each is a separate structured LLM call over a long brief, with a
 * bounded repair attempt behind it. Live on 02.08.2026 `create_pdf` and
 * `create_presentation` timed out on EVERY attempt — after which the failure cap
 * tripped, the loop force-started a THIRD generation, and the abandoned second
 * one quietly finished and wrote its document anyway. The user waited 190s for a
 * turn that reported failure and produced an artifact by accident.
 *
 * 90s is the honest ceiling for one generate + one repair; a generation tool is
 * idempotent per turn (`state.createdDocument`), so this cannot stack.
 */
export const TOOL_TIMEOUT_OVERRIDES_MS: Record<string, number> = {
  research: 30_000,
  create_pdf: 90_000,
  create_presentation: 90_000,
  create_document: 90_000,
  create_sheet: 90_000,
  create_board: 90_000,
};

/**
 * Tools whose args are structured (IDs, enums, board/task fields) rather than
 * a free-text search query. The near-duplicate Jaccard/subset heuristic in
 * `loopGuards.ts` is tuned for re-phrased search queries — for these tools
 * legitimate follow-up calls (another card, a different board field) share
 * most tokens with a prior call and get wrongly rejected as "too similar".
 * MCP/connector tools already skip this heuristic via `serverNameFor`
 * (`wrapTools.ts`); these are its internal-tool equivalent.
 */
export const NEAR_DUPLICATE_EXEMPT_TOOLS: ReadonlySet<string> = new Set([
  'create_board',
  'boards_tasks',
  'documents',
  'read_artifact',
  'notebooks',
  'memory',
  // get → content auf dasselbe Projekt teilen sich bis auf die action jedes Token.
  'groups',
  // get → pause → run_now auf dieselbe taskId: nur die action unterscheidet sie.
  'recurring_tasks',
  // get → update → share_to_group auf denselben identifier: nur die action unterscheidet sie.
  'user_agents',
  // get → add_examples → delete auf dieselbe mention: nur die action unterscheidet sie.
  'recipes',
]);
