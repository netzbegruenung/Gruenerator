/**
 * Chat eval harness — types shared by the SSE parser, the assertions and the
 * runner. See ./README.md for the strategy; run with `pnpm eval:chat`.
 */

/** One captured SSE frame (`event: <name>\ndata: <json>`). */
export interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

/** A single tool invocation reconstructed from tool_step_start/result. */
export interface TracedToolCall {
  toolName: string;
  args: Record<string, unknown>;
  ok: boolean;
  summary?: string;
  result?: Record<string, unknown>;
}

/** Structured, assertion-ready view of one chat turn's SSE stream. */
export interface ChatTrace {
  intent: string | null;
  /** intent event carried `agentic: true` (loop path, classifier LLM skipped). */
  agentic: boolean;
  toolCalls: TracedToolCall[];
  sharepicGenerated: boolean;
  imageGenerated: boolean;
  citations: unknown[];
  /** Grounding proxy: number of citations surfaced on `done`. */
  sources: number;
  fullText: string;
  latencyMs: number;
  /** Non-null when the stream errored or never produced a `done`. */
  error: string | null;
}

/** Per-prompt expectations. All fields optional — only assert what's known. */
export interface EvalExpect {
  /** Exact `intent` value on the intent event. */
  routing?: string;
  /** intent event must carry `agentic: true`. */
  demoted?: boolean;
  toolsMustInclude?: string[];
  toolsMustNotInclude?: string[];
  maxToolCalls?: number;
  generatesSharepic?: boolean;
  /** No web_search/scrape if an internal search returned results. */
  internalOnly?: boolean;
  /** Answer has `[N]` markers, all within source count, none as bare numbers. */
  cited?: boolean;
  /** Answer must not claim it can't create images/sharepics. */
  noCapabilityRefusal?: boolean;
  /** No scrape_url call errored (model-invented / dead URL). */
  noInventedUrls?: boolean;
  /** done surfaced ≥1 citation (grounded). */
  grounded?: boolean;
  maxLatencyMs?: number;
  /** Each keyword must appear in the answer (multi-topic coverage). */
  topicsCovered?: string[];
  /** Answer must correct a false premise (contains a negation near the claim). */
  correctsFalsePremise?: boolean;
}

export interface EvalCase {
  id: string;
  prompt: string;
  category: string;
  /** Model lane to force (e.g. 'mistral' unified vs a split lane). Omit = auto. */
  modelId?: string;
  expect: EvalExpect;
}

export interface AssertionResult {
  name: string;
  pass: boolean;
  detail: string;
}

export interface CaseResult {
  id: string;
  category: string;
  prompt: string;
  latencyMs: number;
  intent: string | null;
  agentic: boolean;
  toolNames: string[];
  error: string | null;
  assertions: AssertionResult[];
  passed: boolean;
}
