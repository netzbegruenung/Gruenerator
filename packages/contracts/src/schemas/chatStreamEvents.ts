import { z } from 'zod';

import { bahnPayloadSchema } from './bahn.js';
import { bundestagPayloadSchema } from './bundestag.js';
import { canvasTemplateTypeSchema } from './canvasTemplateDescriptors.js';
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
  'create_presentation',
  // EXPERIMENTAL: set up a recurring "Wiederkehrende Aufgabe" (agent runs on a schedule).
  'create_recurring_task',
  'chat_history',
  'mcp',
  'direct',
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
export const chatStreamEventSchemas: Record<string, z.ZodTypeAny> = {
  thread_created: z.object({ threadId: z.string() }).passthrough(),
  intent: z
    .object({
      intent: searchIntentSchema,
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
  compute: z.object({ compute: computePayloadSchema.passthrough().optional() }).passthrough(),
  bundestag: z.object({ bundestag: bundestagPayloadSchema.passthrough().optional() }).passthrough(),
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
      interruptType: z.enum(['clarification', 'client_tool']),
      question: z.string().optional(),
      options: z.array(z.string()).optional(),
      toolName: z.string().optional(),
      args: flexibleRecord.optional(),
      threadId: z.string().optional(),
    })
    .passthrough(),
  done: z
    .object({
      threadId: z.string().nullish(),
      citations: z.array(z.unknown()).optional(),
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
      citations: z.array(z.unknown()).optional(),
    })
    .passthrough(),
  error: chatErrorEventPayloadSchema,
};
