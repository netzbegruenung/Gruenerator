import { z } from 'zod';

import { bahnPayloadSchema } from './bahn.js';
import { canvasTemplateTypeSchema } from './canvasTemplateDescriptors.js';
import { notebookCitationSchema } from './notebook.js';
import { socialPostPayloadSchema } from './socialPost.js';

/**
 * Wire payloads for /api/chat-service SSE events that both the Express
 * emitters (apps/api `sseHelpers.ts`) and the chat runtime parser
 * (packages/chat `parseSSEStream.ts`) depend on. Single source of truth —
 * server and client derive their types from these schemas instead of
 * hand-duplicating the shapes on each side of the stream.
 *
 * `chatStreamEventSchemas` at the bottom is the runtime gate the parser runs
 * on EVERY incoming event before its switch: schemas pin exactly the fields
 * the frontend reads (plus `.passthrough()` so un-pinned fields survive), so
 * a malformed event is dropped with a warning instead of flowing into
 * Zustand stores via blind `as` casts.
 */

/**
 * Machine-readable cause of a chat stream failure — travels on the SSE `error`
 * event alongside the human-readable German `error` message. The enum types
 * the backend emitters; the wire schema below deliberately validates `code`
 * as a plain string so an OLDER client never drops an error event just
 * because a NEWER backend introduced a code it doesn't know yet.
 */
export const chatErrorCodeSchema = z.enum([
  'rate_limited',
  'provider_unavailable',
  'first_token_timeout',
  'stream_interrupted',
  'search_degraded',
  'unauthorized',
  'invalid_request',
  'internal',
  // Tool-based editor edits (editor_operations path): planning exhausted its
  // retries server-side, or the client bridge failed to apply the ops.
  'edit_planning_failed',
  'edit_apply_failed',
]);
export type ChatErrorCode = z.infer<typeof chatErrorCodeSchema>;

/**
 * Machine-readable cause of a NON-FATAL degradation — travels on the SSE
 * `warning` event. Codes are monitoring/telemetry vocabulary, never user
 * vocabulary: wherever the turn still has a model available, the degradation
 * is explained by the answer itself (see `degradationNotes` in the API); the
 * warning only carries the machine signal plus a curated German fallback.
 *
 * To add a code: (1) add it here, (2) add its spec to CHAT_WARNINGS in
 * apps/api/routes/chat/services/sseHelpers.ts (the compiler enforces the pair
 * via `satisfies Record<ChatWarningCode, …>`), (3) decide whether the frontend
 * should toast it or stay silent because the answer already explains it.
 *
 * Like `chatErrorCodeSchema`, the wire schema below keeps `code` as a plain
 * string so an OLDER client never drops a warning it doesn't know yet.
 */
export const chatWarningCodeSchema = z.enum([
  // Pre-existing codes (kept as-is — emitted before the taxonomy was introduced)
  'search_degraded',
  'wolke_refs_dropped',
  'wolke_check_failed',
  'doc_creation_failed',
  // Persistence
  'persist_failed',
  // Turn superseded by a concurrent regenerate/edit before its pending row
  // could be finalized — the generated content is intentionally NOT
  // persisted (see postResponseService.ts), so the client needs a distinct
  // signal to stop waiting instead of reading `persist_failed`.
  'turn_discarded',
  // Artefact creation
  'board_creation_failed',
  'task_creation_failed',
  'sheet_creation_failed',
  'presentation_creation_failed',
  'sharepic_failed',
  'generation_failed',
  'edit_failed',
  // Retrieval / sources
  'source_unavailable',
  'rerank_degraded',
  'citation_invalid',
  // Das Notebook hat zur Frage nichts gefunden, was nah genug liegt: der dichte
  // Spitzenwert VOR dem Rerank lag unter der kalibrierten Schwelle (#3140).
  // Kein Defekt und keine Verweigerung — die Antwort streamt mit denselben
  // Quellen weiter, der Hinweis steht darunter.
  'evidence_weak',
  'research_plan_failed',
  // `@deepresearch` was asked for but not served: the daily quota is spent or the
  // call failed. Distinct from `research_plan_failed` — the turn did NOT degrade
  // in quality accidentally, it was capped on purpose, and the message names the
  // reset time. Always carries a `messageOverride`.
  'deep_research_quota_spent',
  // The research agent ran but produced no usable report, so the turn fell back
  // to the ordinary deep-research answer. Worth telling the user: the run cost
  // them minutes of waiting, and silence would read as the long path having
  // simply been slow.
  'deep_agent_failed',
  'classifier_degraded',
  'summary_partial',
  'recall_degraded',
  'connect_reauth_required',
  'mention_context_failed',
  'extraction_failed',
  'mcp_unreachable',
  // A connected MCP server changed its tool DEFINITIONS since the user approved
  // them, so its tools were withheld this turn (rug pull). Distinct from
  // `mcp_unreachable`: the server answered fine, we declined to trust it.
  'mcp_tools_drifted',
  // Ein `mcp`-Turn (@<server>) lief NICHT in der Schleife, wo die Werkzeuge des
  // Servers montiert werden — ein Einzeldurchlauf-Notausschalter (Bildanhang,
  // Verbund-Agent, zweiter Intent) hat ihn draussen gehalten. Weder `unreachable`
  // noch `drifted`: der Server ist gesund, wir haben ihn nur nicht gefragt.
  // Anders als die uebrigen Konnektor-Codes kann die Person das abstellen.
  'mcp_not_consulted',
  // Compute
  'compute_failed',
  // Provider / privacy
  'privacy_mode_degraded',
]);
export type ChatWarningCode = z.infer<typeof chatWarningCodeSchema>;

/** Wire payload of the SSE `error` event (see chatErrorCodeSchema for `code`). */
export const chatErrorEventPayloadSchema = z
  .object({
    error: z.string().optional(),
    code: z.string().optional(),
    retryable: z.boolean().optional(),
    retryAfterMs: z.number().optional(),
  })
  .passthrough();
export type ChatErrorEventPayload = z.infer<typeof chatErrorEventPayloadSchema>;

/**
 * Every chat intent the backend classifier can emit — single source of truth
 * for the `intent` SSE event AND the API's `SearchIntent` type (derived via
 * z.infer in apps/api ChatGraph/types.ts, re-exported by packages/chat).
 * Adding an intent here is the ONE place; both sides pick it up type-safely.
 */
export const searchIntentSchema = z.enum([
  'research',
  'compare',
  'search',
  'web',
  'scrape_url',
  'examples',
  'pressemitteilung_examples',
  'abgeordnetenwatch',
  'bundestag',
  // EXPERIMENTAL first-party system MCP sources (Deutsche Bahn / Open-Meteo /
  // ARD-Tagesschau) — built-in like bundestag, active only when the matching
  // SYSTEM_MCP_*_URL env is set (see apps/api services/mcp/systemMcpServers.ts).
  'bahn',
  // Umbrella travel intent — mounts bahn + hotel (trivago) + wetter together.
  'reise',
  'hotel',
  // Wahlumfragen (Sonntagsfrage via PolitPro + Meinungsbild) — native domain tool.
  'umfragen',
  // Grünerator-Bedienung: Anleitungen aus der Doku (doku.gruenerator.eu) —
  // native domain tool over a generated, in-process index.
  'hilfe',
  'wetter',
  'news',
  'image',
  'image_edit',
  'sharepic',
  'social_post',
  'summary',
  'chart',
  'compute',
  'artifact',
  'save_as_doc',
  'modify_doc',
  'edit_current_doc',
  'edit_current_board',
  'modify_board',
  'share_doc',
  'create_sheet',
  // Follow-up edit on an already-created sheet (Tier 2.7 lastToolContext
  // pickup) — plans typed ops via the same planner the in-editor AI assistant
  // uses, distinct from create_sheet.
  'edit_sheet',
  'create_presentation',
  // Finished, downloadable CI-styled PDF (optionally with Grünen letterhead).
  'create_pdf',
  // EXPERIMENTAL: set up a recurring "Wiederkehrende Aufgabe" (agent runs on a schedule).
  'create_recurring_task',
  'chat_history',
  'mcp',
  // Writing whose substance the user already supplied: pasted material, an
  // attachment, an open document, an edit of existing text, or pure wordcraft
  // with nothing to look up. The narrow half of what `direct` used to mean.
  'produktion',
  // DEPRECATED as a classifier verdict since 2026-07-31 — the residual moved to
  // `agentic` and the supplied-substance half to `produktion`. Still emitted by
  // the parser's garbage fallback and by the heuristic's internal hint, and
  // still READ everywhere: persisted `metadata.intent` and shipped mobile
  // binaries speak it. Do not remove.
  'direct',
  // Pure greeting / thanks / small-talk, decided by a deterministic gate before
  // any LLM runs. Split out of `direct` so the residual and the greeting stop
  // sharing one name: a greeting can never carry sources, never enter the tool
  // loop and never needs reasoning, while a `direct` turn may do all three.
  'greeting',
  // Loop demotion: low-confidence toolable turns skip the LLM classifier and
  // let the agentic loop's model pick the tools itself.
  'agentic',
]);
export type SearchIntent = z.infer<typeof searchIntentSchema>;

/**
 * A chat-generated sharepic variant — the canonical shape shared by the
 * backend generator (sharepicVariantHelpers), the `sharepic_complete` wire
 * payload and the frontend cards/stores. `canvasType` is pinned to the
 * canonical template enum so a junk type can never reach the studio handoff
 * or the canvas mint.
 */
export const sharepicVariantSchema = z
  .object({
    id: z.string(),
    canvasType: canvasTemplateTypeSchema,
    initialProps: z.record(z.string(), z.unknown()),
    label: z.string().optional(),
    /** Accessibility description generated alongside the sharepic text. */
    altText: z.string().optional(),
    /** Set once the variant is minted into a canvas document. */
    canvasId: z.string().optional(),
    /** Per-slide states for deck variants (slider carousel). */
    pages: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough();
export type SharepicVariant = z.infer<typeof sharepicVariantSchema>;

export const searchResultPayloadSchema = z.object({
  source: z.string(),
  title: z.string(),
  content: z.string(),
  url: z.string().optional(),
  relevance: z.number().optional(),
});
export type SearchResultPayload = z.infer<typeof searchResultPayloadSchema>;

/**
 * An image hit from the web search. Its own payload, never an entry in
 * `searchResultPayloadSchema`: there is no `content`, so a shared shape would put
 * a content-less item into the source list and produce a numbered citation with
 * an empty snippet.
 *
 * `url` is a LINK TARGET, never an `<img src>`. Pointing an image tag at it would
 * make the reader's browser fetch a file from an arbitrary third-party host — the
 * exact pattern removed from the citation glyphs, where a favicon request reported
 * the user's IP and the page they were about to open to Google. Thumbnails exist,
 * but they go through `proxyUrl` below, which is what made them displayable at all.
 */
export const searchImagePayloadSchema = z.object({
  title: z.string(),
  /** The image on its source host. Always present; this is what the link opens. */
  url: z.string(),
  domain: z.string(),
  /**
   * Same-origin path that serves the image through our backend, so displaying it
   * costs the reader no request to `domain`. Signed and short-lived — see
   * `imageProxySignature.ts`.
   *
   * Optional on purpose: with no signing secret configured the backend omits it,
   * and the client MUST then fall back to rendering a plain link. A client that
   * assumes this field would put the third-party request back exactly where the
   * proxy was built to remove it.
   */
  proxyUrl: z.string().optional(),
});
export type SearchImagePayload = z.infer<typeof searchImagePayloadSchema>;

/**
 * Union of every style either side can produce: the generator emits
 * 'illustration' … 'universal'; the sharepic flow stamps 'sharepic'.
 * (Server and client previously declared two drifting subsets.)
 */
export const generatedImageStyleSchema = z.enum([
  'illustration',
  'realistic',
  'pixel',
  'green-edit',
  'universal',
  'sharepic',
]);
export type GeneratedImageStyle = z.infer<typeof generatedImageStyleSchema>;

export const generatedImagePayloadSchema = z.object({
  base64: z.string(),
  url: z.string(),
  filename: z.string(),
  prompt: z.string(),
  style: generatedImageStyleSchema,
  generationTimeMs: z.number(),
});
export type GeneratedImagePayload = z.infer<typeof generatedImagePayloadSchema>;

/** Emitted when the agent starts/completes a user-facing tool call. */
export const thinkingStepPayloadSchema = z.object({
  stepId: z.string(),
  toolName: z.string(),
  title: z.string(),
  status: z.enum(['in_progress', 'completed']),
  args: z.record(z.string(), z.unknown()).optional(),
  result: z
    .object({
      resultCount: z.number().optional(),
      results: z.array(z.unknown()).optional(),
      image: generatedImagePayloadSchema.optional(),
      error: z.string().optional(),
    })
    .optional(),
});
export type ThinkingStepPayload = z.infer<typeof thinkingStepPayloadSchema>;

export const confirmActionTypeSchema = z.enum([
  'save_as_doc',
  'modify_doc',
  'modify_board',
  'share_doc',
  'create_group',
  'join_group',
  // Additiv (F0): ausgelieferte Clients kennen den Wert nicht und rendern die
  // Karte über ihren Fallback — sie fällt nicht aus, sie sieht nur generisch aus.
  'add_cloud_connection',
  // Notebook-Karten des `notebooks`-Werkzeugs (09/2026), ebenfalls additiv.
  'attach_wolke_folder',
  'set_notebook_visibility',
  'share_notebook',
  // Projekt-Karte des `groups`-Werkzeugs (09/2026), additiv.
  'set_group_visibility',
  // Karte des `recurring_tasks`-Werkzeugs (09/2026), additiv. Gleichnamig mit
  // dem stillgelegten Intent, bewusst: es ist dieselbe Handlung, nur mit
  // Bestätigung statt stillem Schreiben.
  'create_recurring_task',
  // Karten des `user_agents`-Werkzeugs (09/2026), additiv.
  'create_user_agent',
  'share_user_agent',
]);
export type ConfirmActionType = z.infer<typeof confirmActionTypeSchema>;

/** confirm_action SSE event — the client fills the optionals with defaults. */
export const confirmActionEventSchema = z.object({
  actionId: z.string(),
  type: confirmActionTypeSchema,
  title: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  metadata: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  variant: z.enum(['default', 'destructive']).optional(),
  confirmLabel: z.string().optional(),
  cancelLabel: z.string().optional(),
  threadId: z.string().optional(),
});
export type ConfirmActionEvent = z.infer<typeof confirmActionEventSchema>;

export const documentCreatedEventSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  subtype: z.string(),
  url: z.string(),
});
export type DocumentCreatedEvent = z.infer<typeof documentCreatedEventSchema>;

/**
 * `editor_operations` SSE payload — the agentic loop's editor edit tool planned
 * a batch of operations for the OPEN artifact; the client applies them in place
 * (Univer / Yjs / Konva) via its per-surface bridge. `operations` stays
 * `unknown[]` on the wire (like sharepic variants): the client re-validates each
 * op against the surface's op schema so one malformed op drops alone. `stepId`
 * matches the tool's tool_step_start so the existing tool card updates in place.
 */
export const editorOperationsEventSchema = z
  .object({
    surface: z.enum(['doc', 'sheet', 'presentation', 'board', 'canvas']),
    targetId: z.string(),
    operations: z.array(z.unknown()),
    summary: z.string().optional(),
    stepId: z.string().optional(),
  })
  .passthrough();
export type EditorOperationsEvent = z.infer<typeof editorOperationsEventSchema>;

/**
 * `chart_data` SSE payload — a data visualization the backend `chart` intent
 * extracts from the response and the frontend renders with Recharts.
 */
export const chartPayloadSchema = z.object({
  type: z.enum(['bar', 'line', 'area', 'pie', 'donut']),
  title: z.string(),
  data: z.array(z.record(z.union([z.string(), z.number()]))),
  xKey: z.string(),
  yKeys: z.array(z.string()),
  colors: z.array(z.string()).optional(),
});
export type ChartPayload = z.infer<typeof chartPayloadSchema>;

/**
 * `artifact` SSE payload — a generic renderable HTML/SVG artifact the backend
 * extracts from the response; the frontend renders it in a sandboxed side panel.
 * Deliberately limited to HTML/CSS and SVG (no executable React).
 */
export const artifactPayloadSchema = z.object({
  type: z.enum(['html', 'svg']),
  title: z.string(),
  content: z.string(),
});
export type ArtifactPayload = z.infer<typeof artifactPayloadSchema>;

/**
 * `research_log_*` SSE payloads — the live progress of a deep research run,
 * rendered in the artifact side panel while the run is in flight.
 *
 * Two events rather than one: `research_log_start` opens the panel, every
 * `research_log_update` merges into what is already there. That merge is why the
 * fields are all optional — an update carries only what changed, and an older
 * client that does not know these event names ignores both (unregistered events
 * pass the gate untouched), which is exactly the degradation we want on shipped
 * mobile binaries.
 *
 * `documentUrl` arrives on the last update, when the report has become a real
 * document; the panel then hands off to the ordinary document view.
 */
export const researchLogStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(['running', 'done', 'failed']),
});
export type ResearchLogStep = z.infer<typeof researchLogStepSchema>;

export const researchLogStartSchema = z.object({
  id: z.string(),
  title: z.string(),
});
export type ResearchLogStart = z.infer<typeof researchLogStartSchema>;

export const researchLogUpdateSchema = z.object({
  id: z.string(),
  /** The plan from `write_todos`. Replaces the previous plan wholesale. */
  plan: z.array(researchLogStepSchema).optional(),
  /** Tool activity. Merged by step id, appended when the id is new. */
  steps: z.array(researchLogStepSchema).optional(),
  status: z.enum(['running', 'done', 'failed']).optional(),
  documentUrl: z.string().optional(),
  documentId: z.string().optional(),
});
export type ResearchLogUpdate = z.infer<typeof researchLogUpdateSchema>;

/**
 * `compute` SSE payload — the deterministic result of the `compute` intent.
 * The backend runs the calculation in plain JS (never the LLM), then streams
 * the verified numbers so the frontend can render a transparent "Berechnung"
 * card. `entries` is the label/value list shown in the card; `summary` is a
 * one-line plain-text recap the model is instructed to echo verbatim.
 */
export const computeEntrySchema = z.object({
  label: z.string(),
  value: z.string(),
});
export const computePayloadSchema = z.object({
  /** Human-readable operation label, e.g. "Zeichen zählen" or "Berechnung". */
  operation: z.string(),
  entries: z.array(computeEntrySchema),
  summary: z.string(),
  /** base64-encoded PNGs (no data: prefix) of matplotlib figures the client
   *  produced during a run_python execution. Persisted in the message metadata
   *  so charts survive a reload. Caps are enforced HERE (the resume endpoint
   *  is the trust boundary, express accepts 50mb bodies) and mirrored
   *  client-side in capFigures: max 3 figures, ≤1.5 MB base64 each. */
  figures: z.array(z.string().max(1_500_000)).max(3).optional(),
  /** Files the executed code wrote (exports like a cleaned CSV) — base64 so
   *  they persist in the message metadata and stay downloadable after a
   *  reload. Caps mirrored from capComputeFiles: max 2 files, ≤2 MB each. */
  files: z
    .array(z.object({ name: z.string().max(255), b64: z.string().max(2_000_000) }))
    .max(2)
    .optional(),
  /** SERVER-SET replacements for figures/files: after the resume endpoint
   *  stores the base64 assets under uploads/compute-assets, the persisted
   *  payload carries only these authenticated URLs. Client-sent values are
   *  stripped by the resume handler — only the server mints them. */
  figureUrls: z.array(z.string().max(500)).max(3).optional(),
  fileAssets: z
    .array(z.object({ name: z.string().max(255), url: z.string().max(500) }))
    .max(2)
    .optional(),
});
export type ComputeEntry = z.infer<typeof computeEntrySchema>;
export type ComputePayload = z.infer<typeof computePayloadSchema>;

// ── Runtime event gate ───────────────────────────────────────────────────────

const flexibleRecord = z.record(z.string(), z.unknown());

/** MCP-Apps widget pointer carried on `tool_step_result.result.uiResource` for
 *  SYSTEM MCP tools only. The HTML is fetched on demand via `/api/mcp-apps`
 *  (not inlined here); the client mounts it in a sandboxed iframe. */
export const uiResourceSchema = z
  .object({
    serverKey: z.string(),
    toolName: z.string(),
    uri: z.string(),
    structuredContent: flexibleRecord.optional(),
  })
  .passthrough();
export type UiResource = z.infer<typeof uiResourceSchema>;

/** sharepic_updated wire payload — canvasType pinned to the canonical enum so
 *  a junk template type can never enter the live store / studio handoff. */
export const sharepicUpdatedEventSchema = z
  .object({
    variantId: z.string(),
    canvasId: z.string(),
    version: z.number(),
    canvasType: canvasTemplateTypeSchema,
    state: flexibleRecord.optional(),
    pages: z.array(flexibleRecord).optional(),
    summary: z.string(),
  })
  .passthrough();
export type SharepicUpdatedEvent = z.infer<typeof sharepicUpdatedEventSchema>;

export const reelSegmentSchema = z.object({
  id: z.number(),
  startTime: z.number(),
  endTime: z.number(),
  text: z.string(),
});
export type ReelSegment = z.infer<typeof reelSegmentSchema>;

export const reelUpdatedEventSchema = z
  .object({
    projectId: z.string(),
    title: z.string(),
    segments: z.array(reelSegmentSchema),
    summary: z.string(),
    changedIndices: z.array(z.number()),
  })
  .passthrough();
export type ReelUpdatedEvent = z.infer<typeof reelUpdatedEventSchema>;

/**
 * Per-event runtime validation gate for the chat SSE stream. Policy: pin the
 * fields the frontend parser actually READS (type + presence); everything
 * else survives via `.passthrough()` so new backend fields never get
 * stripped or rejected. Events without an entry pass through unvalidated
 * (same as before this gate existed).
 *
 * Deliberately loose where multiple emitters share an event (`done`,
 * `completion`, tool results) — those pin only optional fields, so the gate
 * can drop a *malformed* event but never a *richer* one.
 */
/**
 * A citation on the `done` event — the ChatGraph/agentic-loop shape
 * (`apps/api/agents/langgraph/ChatGraph/types.ts`, `Citation`). Distinct from
 * the notebook flow's `notebookCitationSchema`, which travels on `completion`
 * and keys its sources as `index: string` with snake_case document fields.
 * Both were `z.array(z.unknown())` here, which is how two divergent shapes for
 * the same concept could grow without a single type error.
 *
 * TOTAL BY CONSTRUCTION — every field either has a `.catch()` fallback or is
 * optional, so validation cannot fail. That is not laziness, it is required:
 * the parser DROPS an event whose schema fails, and dropping `done` costs the
 * terminal event, which the client then reports as a failed turn. `done` is
 * also emitted through `sendRaw` in several places (agent graphs, recall loop)
 * that bypass the typed emitter entirely. So this schema documents and derives
 * the shape; it must never be the reason an answer is thrown away.
 */
const chatCitationBase = z.object({
  id: z.number().catch(0),
  title: z.string().catch(''),
  url: z.string().catch(''),
  snippet: z.string().catch(''),
  source: z.string().catch(''),
  citedText: z.string().optional(),
  collectionName: z.string().optional(),
  domain: z.string().optional(),
  relevance: z.number().optional(),
  contentType: z.string().optional(),
  documentId: z.string().optional(),
  chunkIndex: z.number().optional(),
  similarityScore: z.number().optional(),
  /** Seite im Ursprungsdokument, wenn der Chunk eine trägt (PDF-Ingest). */
  pageNumber: z.number().nullable().optional(),
  collectionId: z.string().optional(),
  /** Set on fan-out per-document retrieval, so the UI can group source cards
   *  by the document they answer for. */
  documentSourceId: z.string().optional(),
});

export const chatCitationSchema = chatCitationBase.passthrough();
/** The type the chat UI consumes — derived, never hand-written alongside. */
export type ChatCitation = z.infer<typeof chatCitationBase>;

export const chatStreamEventSchemas: Record<string, z.ZodTypeAny> = {
  thread_created: z.object({ threadId: z.string() }).passthrough(),
  intent: z
    .object({
      // `.catch` instead of a bare enum: the gate DROPS any event it rejects,
      // so a backend that emits an intent the client's bundle predates would
      // lose the whole progress transition — not just the unknown name. Every
      // shipped mobile binary is such a client the moment an intent is added.
      // `direct` is the safe degradation: it maps to the neutral "generating"
      // stage and has no INTENT_TO_TOOL entry, so no ghost tool card appears.
      intent: searchIntentSchema.catch('direct'),
      message: z.string(),
      reasoning: z.string().optional(),
      searchQuery: z.string().optional(),
      subQueries: z.array(z.string()).nullish(),
      searchSources: z.array(z.string()).nullish(),
      // Set by the agentic respond path: the model holds the tools and drives
      // the loop, so real `tool_step_*` cards will follow — the parser then
      // skips the intent-fabricated tool card (INTENT_TO_TOOL). Older clients
      // ignore the flag (forward-compatible).
      agentic: z.boolean().optional(),
    })
    .passthrough(),
  search_start: z.object({ message: z.string() }).passthrough(),
  search_complete: z
    .object({
      message: z.string(),
      resultCount: z.number(),
      results: z.array(searchResultPayloadSchema.passthrough()).optional(),
      /** Image hits, separate from `results` — see `searchImagePayloadSchema`. */
      images: z.array(searchImagePayloadSchema.passthrough()).optional(),
      researchMeta: z.unknown().optional(),
      examplesResult: z
        .object({
          press: z.array(z.unknown()).optional(),
          social: z.array(z.unknown()).optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough(),
  /**
   * Image hits from a search inside the agentic loop.
   *
   * Its own event rather than `search_complete.images`: the loop never sends a
   * `search_complete` (it streams `tool_step_*` cards instead), and that event
   * also drives the progress stage — borrowing it would move the status line on
   * every image batch. Carries the FULL list for the turn each time, so the
   * client replaces rather than merges.
   *
   * A client that predates this event ignores it (unknown names pass the gate
   * untouched) and simply shows no images — the same state as today.
   */
  search_images: z
    .object({ images: z.array(searchImagePayloadSchema.passthrough()) })
    .passthrough(),
  summary_start: z.object({ message: z.string() }).passthrough(),
  summary_complete: z.object({ message: z.string() }).passthrough(),
  image_start: z.object({ message: z.string() }).passthrough(),
  image_complete: z
    .object({
      message: z.string(),
      image: generatedImagePayloadSchema.passthrough().nullish(),
      error: z.string().optional(),
    })
    .passthrough(),
  chart_data: z.object({ chart: chartPayloadSchema.passthrough().optional() }).passthrough(),
  artifact: z.object({ artifact: artifactPayloadSchema.passthrough().optional() }).passthrough(),
  research_log_start: researchLogStartSchema.passthrough(),
  research_log_update: researchLogUpdateSchema.passthrough(),
  compute: z.object({ compute: computePayloadSchema.passthrough().optional() }).passthrough(),
  bahn: z.object({ bahn: bahnPayloadSchema.passthrough().optional() }).passthrough(),
  // variants stay unknown[] here: per-item validation (sharepicVariantSchema)
  // happens in coerceSharepicVariants so ONE malformed variant drops alone
  // instead of killing the whole event.
  sharepic_complete: z
    .object({
      message: z.string(),
      variants: z.array(z.unknown()).optional(),
      canvasType: z.string().optional(),
      initialProps: flexibleRecord.optional(),
      error: z.string().optional(),
      /** No variants because the model DECLINED on content grounds, not because
       *  generation failed; `message` carries the German reason. Deliberately
       *  distinct from `error` — a decline is the safety rules working, and
       *  reporting it as a failure invites the user to simply retry. */
      declined: z.boolean().optional(),
    })
    .passthrough(),
  sharepic_minted: z.object({ variantId: z.string(), canvasId: z.string() }).passthrough(),
  sharepic_updated: sharepicUpdatedEventSchema,
  sharepic_edit_error: z
    .object({ variantId: z.string().optional(), error: z.string() })
    .passthrough(),
  social_post_complete: z
    .object({
      message: z.string(),
      post: socialPostPayloadSchema.passthrough().optional(),
      error: z.string().optional(),
    })
    .passthrough(),
  social_post_updated: z
    .object({
      postId: z.string(),
      post: socialPostPayloadSchema.passthrough(),
      summary: z.string(),
    })
    .passthrough(),
  social_post_edit_error: z
    .object({ postId: z.string().optional(), error: z.string() })
    .passthrough(),
  reel_processing: z.object({ uploadId: z.string(), filename: z.string() }).passthrough(),
  reel_picker: z.object({ projects: z.array(z.unknown()) }).passthrough(),
  reel_updated: reelUpdatedEventSchema,
  reel_edit_error: z.object({ projectId: z.string().optional(), error: z.string() }).passthrough(),
  tool_step_start: z
    .object({
      stepId: z.string(),
      toolName: z.string(),
      args: flexibleRecord.optional(),
      // Server-provided card title (else the client derives one from toolName);
      // serverName labels a connector/MCP tool. Both optional + additive.
      title: z.string().optional(),
      serverName: z.string().optional(),
      // Planner announcement sentence(s) streamed before this tool call started
      // (split-gather mode only). Persisted on the tool-call part and rendered
      // as muted text above the card — the durable form of gather_narration.
      narration: z.string().optional(),
    })
    .passthrough(),
  tool_step_result: z
    .object({
      stepId: z.string(),
      toolName: z.string(),
      ok: z.boolean(),
      summary: z.string().optional(),
      // Rich result payload for mid-stream card rendering (results/examples/
      // researchMeta/…). Stamped onto the tool-call part by the parser.
      result: flexibleRecord.optional(),
    })
    .passthrough(),
  response_start: z.object({ message: z.string() }).passthrough(),
  thinking_step: z
    .object({
      stepId: z.string(),
      toolName: z.string(),
      title: z.string(),
      status: z.enum(['in_progress', 'completed']),
      args: flexibleRecord.optional(),
      result: z.unknown().optional(),
    })
    .passthrough(),
  progress_step: z
    .object({
      title: z.string(),
      status: z.enum(['in_progress', 'completed']),
    })
    .passthrough(),
  text_delta: z.object({ text: z.string() }).passthrough(),
  reasoning_delta: z.object({ text: z.string() }).passthrough(),
  // Split-gather narration: one trimmed sentence per event (backend chunker),
  // only between tool steps of the gather phase, never after response_start.
  // Rendered as the live status line (custom.progress), never as a message part.
  gather_narration: z.object({ text: z.string() }).passthrough(),
  fallback: z
    .object({
      from: z.object({ id: z.string(), name: z.string() }).passthrough(),
      to: z.object({ id: z.string(), name: z.string() }).passthrough(),
      reason: z.string(),
    })
    .passthrough(),
  warning: z.object({ code: z.string(), message: z.string() }).passthrough(),
  interrupt: z
    .object({
      interruptType: z.enum(['clarification', 'client_tool', 'tool_approval']),
      question: z.string().optional(),
      options: z.array(z.string()).optional(),
      toolName: z.string().optional(),
      args: flexibleRecord.optional(),
      threadId: z.string().optional(),
      approvalTurnId: z.string().optional(),
      calls: z
        .array(
          z.object({
            toolCallId: z.string(),
            toolName: z.string(),
            args: flexibleRecord,
            title: z.string().optional(),
            serverName: z.string().optional(),
          })
        )
        .optional(),
    })
    .passthrough(),
  done: z
    .object({
      threadId: z.string().nullish(),
      citations: z.array(chatCitationSchema).optional(),
      generatedImage: z.unknown().optional(),
      metadata: flexibleRecord.optional(),
      interrupted: z.boolean().optional(),
    })
    .passthrough(),
  confirm_action: confirmActionEventSchema.passthrough(),
  document_created: documentCreatedEventSchema.passthrough(),
  editor_operations: editorOperationsEventSchema,
  document_indexed: z.object({ documentId: z.string() }).passthrough(),
  sources_preview: z
    .object({
      results: z.array(z.unknown()).optional(),
      resultCount: z.number().optional(),
    })
    .passthrough(),
  suggestions: z.object({ suggestions: z.array(z.string()).optional() }).passthrough(),
  research_step: z.object({ step: z.string(), message: z.string() }).passthrough(),
  completion: z
    .object({
      text: z.string().optional(),
      answer: z.string().optional(),
      // `completion` carries BOTH shapes, depending on who emits it: the
      // notebook stream sends `notebookCitationSchema`, while the citation
      // clamp on the chat paths (agenticRespondService, chatGraphContractRouter)
      // sends chat citations. Pinning either one alone would drop the event —
      // and with it the clamped text — for the other half of the emitters.
      // Notebook first: it is the discriminating one (`index` is required),
      // and the chat schema is total, so it would otherwise swallow everything.
      citations: z
        .array(z.union([notebookCitationSchema.passthrough(), chatCitationSchema]))
        .optional(),
    })
    .passthrough(),
  error: chatErrorEventPayloadSchema,
};

/**
 * Intent → tool name used to live in TWO hand-maintained copies here and in
 * `packages/chat`. The intersection was pulled into this file first; it now
 * lives in the intent registry (`@gruenerator/shared/chat-intents`), which owns
 * the whole per-intent description and derives BOTH maps — so the client's
 * live card and the server's persisted one cannot disagree.
 *
 * Nothing intent-shaped belongs here any more: this file owns the wire enum
 * (`searchIntentSchema` above), and the registry is keyed by it.
 */
