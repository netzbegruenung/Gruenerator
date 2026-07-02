import { z } from 'zod';

/**
 * Wire payloads for /api/chat-service SSE events that both the Express
 * emitters (apps/api `sseHelpers.ts`) and the chat runtime parser
 * (packages/chat `parseSSEStream.ts`) depend on. Single source of truth —
 * server and client derive their types from these schemas instead of
 * hand-duplicating the shapes on each side of the stream.
 */

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
   *  (same base64-in-metadata pattern as generatedImage) so charts survive a
   *  reload. Client caps: max 3 figures, ≤1.5 MB base64 each. */
  figures: z.array(z.string()).optional(),
  /** Files the executed code wrote (exports like a cleaned CSV) — base64 so
   *  they persist in the message metadata and stay downloadable after a
   *  reload. Client caps: max 2 files, ≤2 MB base64 each. */
  files: z.array(z.object({ name: z.string(), b64: z.string() })).optional(),
});
export type ComputeEntry = z.infer<typeof computeEntrySchema>;
export type ComputePayload = z.infer<typeof computePayloadSchema>;
