/**
 * Chat eval harness — types shared by the SSE parser, the assertions and the
 * runner. See ./README.md for the strategy; run with `pnpm eval:chat`.
 *
 * The corpus-facing shapes (EvalExpect/EvalTurn/EvalScenario/EvalCase) are Zod
 * schemas with the TS types derived via `z.infer`. They used to be hand-written
 * interfaces parsed with a bare `JSON.parse(l) as EvalCase`, i.e. no runtime
 * check at all: a typo'd key silently became `undefined`, the assertion it was
 * meant to drive never ran, and the scenario reported green having asserted
 * nothing. `loadCorpus()` now safeParses every line and names the file, line
 * number and offending path.
 */
import { notebookDepthSchema } from '@gruenerator/contracts';
import { z } from 'zod';

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
  /**
   * Text the turn PRODUCED somewhere other than the answer stream — today the
   * `social_post_complete` post body. On such a turn `fullText` is only the
   * wrapper sentence ("Hier ist dein Post."), so every check about what was
   * WRITTEN has to read this as well, or it grades the frame instead of the
   * picture.
   */
  generatedText: string[];
  /** `type` of every confirm_action card offered (save_as_doc, modify_board, …).
   *  A card is a persistent action the user is one click away from — offering
   *  one on a turn that forbade it is the defect, not the click. */
  confirmActions: string[];
  /** A document_created event fired (a document was actually persisted). */
  documentCreated: boolean;
}

/**
 * Which product surface a scenario exercises. `chat` posts to
 * /api/chat-graph/stream, `notebook` to /api/chat-service/notebook/stream —
 * two different endpoints with two different event vocabularies. An enum, not
 * a free string: a typo'd surface must fail at load time rather than silently
 * posting notebook prompts at the chat endpoint.
 */
export const evalSurfaceSchema = z.enum(['chat', 'notebook']);
export type EvalSurface = z.infer<typeof evalSurfaceSchema>;

/** Notebook retrieval depth — the wire enum itself, not a second copy of it. */
export const evalNotebookModeSchema = notebookDepthSchema;

/**
 * The LLM-judge rubrics a turn may request. An enum, not a free string: a
 * corpus line naming a rubric that doesn't exist would otherwise load fine and
 * simply never be judged. `judge/rubrics.ts` derives its `RubricName` from
 * this — it imports from here, so the list has to live on this side.
 */
export const rubricNameSchema = z.enum([
  'groundedness',
  'narration_consistency',
  'known_answer',
  'german_quality',
  'parity',
  'instruction_hierarchy',
  'content_policy',
]);
export type RubricName = z.infer<typeof rubricNameSchema>;

/** Per-prompt expectations. All fields optional — only assert what's known.
 *  `.strict()` is the point: an unknown key is a typo, and a typo'd assertion
 *  is one that never runs. */
export const evalExpectSchema = z
  .object({
    /** Exact `intent` value on the intent event. */
    routing: z.string().optional(),
    /** Intents this turn must NOT resolve to (e.g. follow-up must not fall to direct). */
    routingNot: z.array(z.string()).optional(),
    /** intent event must carry `agentic: true`. */
    demoted: z.boolean().optional(),
    toolsMustInclude: z.array(z.string()).optional(),
    /** Each inner group: at least one of these tools must have been called. */
    toolsAnyOf: z.array(z.array(z.string())).optional(),
    /** At least one called tool's name matches this regex (source string). Use
     *  for MCP, whose tool names are namespaced `m<serverKey>__<tool>` and thus
     *  not known ahead of time — e.g. `"^m[0-9a-f]+__"` = "an MCP tool ran". */
    toolNameMatches: z.string().optional(),
    toolsMustNotInclude: z.array(z.string()).optional(),
    maxToolCalls: z.number().optional(),
    generatesSharepic: z.boolean().optional(),
    /**
     * Whether the turn may create/update a persistent artifact — a document, or a
     * confirm_action card offering one.
     *
     * `false` is the load-bearing case and the reason this exists: "Erstelle
     * diesmal kein Dokument" used to produce a document-update card anyway, and no
     * existing assertion could see it (a card is neither a tool call nor an
     * intent).
     */
    offersPersistentAction: z.boolean().optional(),
    /** The turn asks the user a clarifying question instead of guessing. `false`
     *  is the load-bearing case: it states "this ask was unambiguous, do not
     *  interrupt". */
    asksClarification: z.boolean().optional(),
    /** No web_search/scrape if an internal search returned results. */
    internalOnly: z.boolean().optional(),
    /** Answer has `[N]` markers, all within source count, none as bare numbers. */
    cited: z.boolean().optional(),
    /** Answer must not claim it can't create images/sharepics. */
    noCapabilityRefusal: z.boolean().optional(),
    /**
     * Minimum answer length. Guards the "ghost answer" class: the turn reports
     * success and streams a one-line confirmation while the requested content
     * never appears (no error, no content).
     */
    minAnswerChars: z.number().optional(),
    /**
     * If the answer IS a refusal, it must be written in this language. A German
     * product refusing in English is a defect even when the refusal is correct.
     *
     * Note what this does NOT say: a non-refusal passes ("not a refusal"). It is
     * a language check, never a "must decline" check — use {@link refuses} for
     * that. The three content-policy scenarios asserted only this and
     * `generatesSharepic: false`, which meant they stayed green while the model
     * wrote the fabricated quote / the group-defamation post in full.
     */
    refusalLanguage: z.literal('de').optional(),
    /**
     * Whether the answer must BE a refusal. Both cases carry weight:
     * `true` states "producing this content is the defect" (fabricated quotes
     * attributed to a real person, group defamation); `false` is the
     * over-refusal guard that keeps a hardening pass from breaking legitimate
     * work.
     */
    refuses: z.boolean().optional(),
    /**
     * Substrings that must NOT appear in the answer (case-insensitive).
     *
     * The deterministic floor under the `instruction_hierarchy` judge: injection
     * is semantic in general, but a KNOWN payload leaves a lexical trace — the
     * codeword it demanded, the payment address it wanted forwarded, the
     * internal filenames it induced. Those can be proven from the trace alone,
     * so they must not depend on a judge run that `passed` never waits for.
     */
    answerMustNotContain: z.array(z.string()).optional(),
    /**
     * Turn 2+: sources retrieved in an earlier turn must still be usable. Fails
     * when the answer denies having sources while the thread has them.
     */
    retainsPriorSources: z.boolean().optional(),
    /** No scrape_url call errored (model-invented / dead URL). */
    noInventedUrls: z.boolean().optional(),
    /** done surfaced ≥1 citation (grounded). */
    grounded: z.boolean().optional(),
    maxLatencyMs: z.number().optional(),
    /** Each keyword must appear in the answer (multi-topic coverage). */
    topicsCovered: z.array(z.string()).optional(),
    /** Answer must correct a false premise (contains a negation near the claim). */
    correctsFalsePremise: z.boolean().optional(),
    /** Turn 2+: threadId must equal turn 1's (catches thread races / re-minting). */
    sameThread: z.boolean().optional(),
    /** Turn 2+: this turn must reference an artifact created in an earlier turn. */
    editsPreviousArtifact: z.boolean().optional(),
    /** Text must not deny an edit that happened, nor claim research with 0 tool calls. */
    narrationMatchesAction: z.boolean().optional(),
    /** LLM-judge checks to run on this turn (eval:judge; ignored by assertions). */
    judge: z.array(rubricNameSchema).optional(),
    /** Facts the answer must not contradict (judge `known_answer` rubric). */
    judgeFacts: z.array(z.string()).optional(),
  })
  .strict();
export type EvalExpect = z.infer<typeof evalExpectSchema>;

/** One turn of a scenario. Single-turn legacy cases normalize to one EvalTurn. */
export const evalTurnSchema = z
  .object({
    prompt: z.string(),
    expect: evalExpectSchema,
    /** Answer to send via /resume if this turn raises a clarification interrupt. */
    onInterrupt: z.object({ resume: z.string() }).strict().optional(),
    /** Prepend N synthetic filler user/assistant pairs to the wire history
     *  (long-thread breadth probe — exercises pruning without replaying turns). */
    padTurns: z.number().optional(),
    /** Send the previously created sharepic variant as `currentSharepic` — mimics
     *  the client's "Im Chat bearbeiten" toggle so edit turns hit the edit branch. */
    useCreatedSharepic: z.boolean().optional(),
  })
  .strict();
export type EvalTurn = z.infer<typeof evalTurnSchema>;

export const evalScenarioSchema = z
  .object({
    id: z.string(),
    category: z.string(),
    /** Free-text annotation for humans — why this scenario exists, what bug it
     *  pins. Ignored by the runner; declared so `.strict()` accepts it. */
    note: z.string().optional(),
    /** Model lane to force (e.g. 'mistral' unified vs a split lane). Omit = auto. */
    modelId: z.string().optional(),
    /** Product surface. Omit = 'chat' (every pre-existing scenario). */
    surface: evalSurfaceSchema.optional(),
    /** Notebook collection(s) to query — required when surface is 'notebook'. */
    collectionIds: z.array(z.string()).optional(),
    /** Notebook retrieval mode. Omit = server default. */
    notebookMode: evalNotebookModeSchema.optional(),
    turns: z.array(evalTurnSchema),
    /** Documented open bug: runs + reported separately, never fails the baseline. */
    knownFailure: z.boolean().optional(),
    /** Long/expensive scenario — skipped unless EVAL_SLOW=1. */
    slow: z.boolean().optional(),
    /** Needs connected MCP servers (evals/tools/setupMcpServers.ts) — skipped
     *  unless EVAL_MCP=1 so it doesn't pollute the default run's baseline. */
    mcpLane: z.boolean().optional(),
    /** Notebook surface. Skipped unless EVAL_NOTEBOOK=1 so these don't move the
     *  default run's baseline. No seeding tool needed — the scenarios query
     *  SYSTEM_COLLECTIONS, which every populated backend already has. */
    notebookLane: z.boolean().optional(),
  })
  .strict()
  .refine((s) => s.surface !== 'notebook' || (s.collectionIds?.length ?? 0) > 0, {
    message: "surface 'notebook' requires a non-empty collectionIds",
    path: ['collectionIds'],
  });
export type EvalScenario = z.infer<typeof evalScenarioSchema>;

/** Legacy single-turn corpus line (still accepted; normalized to EvalScenario). */
export const evalCaseSchema = z
  .object({
    id: z.string(),
    prompt: z.string(),
    category: z.string(),
    /** Free-text annotation for humans (see evalScenarioSchema.note). */
    note: z.string().optional(),
    /** Model lane to force (e.g. 'mistral' unified vs a split lane). Omit = auto. */
    modelId: z.string().optional(),
    expect: evalExpectSchema,
    knownFailure: z.boolean().optional(),
  })
  .strict();
export type EvalCase = z.infer<typeof evalCaseSchema>;

/** A corpus line is either shape; `turns` discriminates (see `isScenario`). */
export const evalCorpusLineSchema = z.union([evalScenarioSchema, evalCaseSchema]);

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
  /** Citations surfaced across all earlier turns (retainsPriorSources). */
  priorSourceCount: number;
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
  imageGenerated: boolean;
  citations: unknown[];
  fullText: string;
  /** Text produced outside the answer stream (social_post body). See ChatTrace. */
  generatedText: string[];
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
