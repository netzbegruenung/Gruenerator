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

/** An `interrupt` event captured mid-stream (clarification / client_tool). */
export interface TracedInterrupt {
  interruptType: string;
  question?: string;
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
  /** From thread_created (or interrupt payload) — the server-side thread. */
  threadId: string | null;
  interrupts: TracedInterrupt[];
  /** Ids of artifacts created this turn (document_created, sharepic/image variants). */
  artifactIds: string[];
  /** Ids this turn referenced (edit targets: sharepic_updated, editor_operations). */
  referencedIds: string[];
  /** `warning` event codes (e.g. search_degraded, unknown_model_id). */
  warnings: string[];
  /** An editor_operations event fired (edit ops actually applied). */
  editorOps: boolean;
  /** A sharepic_updated event fired (sharepic edit actually applied). */
  sharepicUpdated: boolean;
  /** Raw variant objects from sharepic_complete (id, canvasType, canvasId?). */
  sharepicVariants: Record<string, unknown>[];
}

/** Per-prompt expectations. All fields optional — only assert what's known. */
export interface EvalExpect {
  /** Exact `intent` value on the intent event. */
  routing?: string;
  /** Intents this turn must NOT resolve to (e.g. follow-up must not fall to direct). */
  routingNot?: string[];
  /** intent event must carry `agentic: true`. */
  demoted?: boolean;
  toolsMustInclude?: string[];
  /** Each inner group: at least one of these tools must have been called. */
  toolsAnyOf?: string[][];
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
  /** Turn 2+: threadId must equal turn 1's (catches thread races / re-minting). */
  sameThread?: boolean;
  /** Turn 2+: this turn must reference an artifact created in an earlier turn. */
  editsPreviousArtifact?: boolean;
  /** Text must not deny an edit that happened, nor claim research with 0 tool calls. */
  narrationMatchesAction?: boolean;
  /** LLM-judge checks to run on this turn (eval:judge; ignored by assertions). */
  judge?: string[];
  /** Facts the answer must not contradict (judge `known_answer` rubric). */
  judgeFacts?: string[];
}

/** One turn of a scenario. Single-turn legacy cases normalize to one EvalTurn. */
export interface EvalTurn {
  prompt: string;
  expect: EvalExpect;
  /** Answer to send via /resume if this turn raises a clarification interrupt. */
  onInterrupt?: { resume: string };
  /** Prepend N synthetic filler user/assistant pairs to the wire history
   *  (long-thread breadth probe — exercises pruning without replaying turns). */
  padTurns?: number;
  /** Send the previously created sharepic variant as `currentSharepic` — mimics
   *  the client's "Im Chat bearbeiten" toggle so edit turns hit the edit branch. */
  useCreatedSharepic?: boolean;
}

export interface EvalScenario {
  id: string;
  category: string;
  /** Model lane to force (e.g. 'mistral' unified vs a split lane). Omit = auto. */
  modelId?: string;
  turns: EvalTurn[];
  /** Documented open bug: runs + reported separately, never fails the baseline. */
  knownFailure?: boolean;
  /** Long/expensive scenario — skipped unless EVAL_SLOW=1. */
  slow?: boolean;
}

/** Legacy single-turn corpus line (still accepted; normalized to EvalScenario). */
export interface EvalCase {
  id: string;
  prompt: string;
  category: string;
  /** Model lane to force (e.g. 'mistral' unified vs a split lane). Omit = auto. */
  modelId?: string;
  expect: EvalExpect;
  knownFailure?: boolean;
}

export interface AssertionResult {
  name: string;
  pass: boolean;
  detail: string;
}

/** Cross-turn context the runner threads through a scenario for assertions. */
export interface ScenarioContext {
  /** threadId captured from the scenario's first turn. */
  firstThreadId: string | null;
  /** Artifact ids created in all earlier turns. */
  priorArtifactIds: string[];
  /** Raw first variant of the last sharepic_complete (for useCreatedSharepic). */
  lastSharepicVariant: Record<string, unknown> | null;
}

/** One executed turn — enriched so the LLM judge can consume last-run.json. */
export interface TurnResult {
  turnIndex: number;
  prompt: string;
  latencyMs: number;
  intent: string | null;
  agentic: boolean;
  toolCalls: { toolName: string; ok: boolean; summary?: string }[];
  threadId: string | null;
  warnings: string[];
  interrupts: TracedInterrupt[];
  artifactIds: string[];
  editorOps: boolean;
  sharepicUpdated: boolean;
  citations: unknown[];
  fullText: string;
  error: string | null;
  assertions: AssertionResult[];
  passed: boolean;
  /** The judge checks + facts requested for this turn (copied from expect). */
  judge?: string[];
  judgeFacts?: string[];
}

export interface CaseResult {
  id: string;
  category: string;
  /** First-turn prompt (scenario summary line). */
  prompt: string;
  latencyMs: number;
  intent: string | null;
  agentic: boolean;
  toolNames: string[];
  error: string | null;
  assertions: AssertionResult[];
  passed: boolean;
  knownFailure?: boolean;
  turns: TurnResult[];
}
