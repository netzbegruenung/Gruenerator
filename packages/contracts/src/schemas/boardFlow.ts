/**
 * Zod schemas for board "AI columns" (the lightweight mini-n8n flow).
 *
 * A KI-Spalte (AI column) is a 3-stage pipeline attached to a status SelectOption:
 *   SOURCE (Stufe 1)  →  AI STEP (Stufe 2)  →  OUTPUT NODES (Stufe 3)
 * The whole config lives in `selectOption.aiTask` (see boards.ts) and is sent to
 * POST /api/boards/:boardId/cards/:cardId/agent-run when a user clicks "Grünerator-
 * Agent starten" on a card. The server resolves the source, runs the existing agent
 * generation, then executes the output nodes (comment / document / email).
 *
 * MAINTAINABILITY: every node type is a discriminated-union literal here. Backend and
 * frontend hold registries keyed by these literals (`satisfies Record<Type, …>`), so
 * adding a node type is a localized, type-checked change — never destructure on `type`.
 */
import { z } from 'zod';

// ── Stufe 2: AI task presets (curated prompt templates over the existing tools) ──

export const boardAiPresetSchema = z.enum([
  'web_research',
  'deep_research',
  'doc_search',
  'summarize',
]);
export type BoardAiPreset = z.infer<typeof boardAiPresetSchema>;

/** UI-facing catalog (label/description only — icons live in the frontend registry). */
export const BOARD_AI_PRESETS = [
  {
    type: 'web_research',
    label: 'Webrecherche',
    description: 'Aktuelle Infos aus dem Web zum Karten-Thema.',
  },
  {
    type: 'deep_research',
    label: 'Tiefenrecherche',
    description: 'Mehrquellige, zitierte Recherche.',
  },
  {
    type: 'doc_search',
    label: 'Dokumentensuche',
    description: 'Parteiprogramme & Beschlüsse durchsuchen.',
  },
  {
    type: 'summarize',
    label: 'Zusammenfassung',
    description: 'Karteninhalt prägnant zusammenfassen.',
  },
] as const satisfies ReadonlyArray<{ type: BoardAiPreset; label: string; description: string }>;

// ── Stufe 1: source nodes (where the AI step's context comes from) ──────────────

export const boardFlowSourcePlatformSchema = z.enum(['instagram', 'facebook']);
export type BoardFlowSourcePlatform = z.infer<typeof boardFlowSourcePlatformSchema>;

/**
 * `apify_social.handleField` is the id of the card field whose cell holds the
 * account handle; when null the server falls back to the card title.
 */
export const boardFlowSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('card') }),
  z.object({ type: z.literal('scrape_url') }),
  z.object({
    type: z.literal('apify_social'),
    platform: boardFlowSourcePlatformSchema,
    handleField: z.string().nullish(),
  }),
]);
export type BoardFlowSource = z.infer<typeof boardFlowSourceSchema>;
export type BoardFlowSourceType = BoardFlowSource['type'];

// ── Stufe 2: the AI step (preset or free-text "interpose AI") ────────────────────

export const boardFlowTaskSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('preset'), preset: boardAiPresetSchema }),
  z.object({ type: z.literal('custom'), prompt: z.string().min(1).max(2000) }),
]);
export type BoardFlowTask = z.infer<typeof boardFlowTaskSchema>;
export type BoardFlowTaskType = BoardFlowTask['type'];

// ── Stufe 3: output nodes (what happens with the AI result) ──────────────────────

export const boardFlowOutputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('comment') }),
  z.object({ type: z.literal('document') }),
  z.object({ type: z.literal('sheet') }),
  z.object({ type: z.literal('presentation') }),
  z.object({ type: z.literal('email') }),
]);
export type BoardFlowOutput = z.infer<typeof boardFlowOutputSchema>;
export type BoardFlowOutputType = BoardFlowOutput['type'];

// ── The column config (stored on selectOption.aiTask) ────────────────────────────

export const boardAiTaskSchema = z.object({
  source: boardFlowSourceSchema,
  task: boardFlowTaskSchema,
  outputs: z.array(boardFlowOutputSchema).min(1),
});
export type BoardAiTask = z.infer<typeof boardAiTaskSchema>;

// ── Card context the client sends with the run request ───────────────────────────
// The board lives in Yjs on the client, so the card's title/description/url come
// from the client rather than a server-side Yjs read.

export const boardFlowCardContextSchema = z.object({
  title: z.string().default(''),
  description: z.string().default(''),
  url: z.string().nullish(),
  /** Pre-resolved account handle for apify_social (else the server uses the title). */
  handle: z.string().nullish(),
});
export type BoardFlowCardContext = z.infer<typeof boardFlowCardContextSchema>;

/** What gets persisted in agent_tasks.flow_config and read by the worker. */
export const boardFlowConfigSchema = boardAiTaskSchema.extend({
  cardContext: boardFlowCardContextSchema,
});
export type BoardFlowConfig = z.infer<typeof boardFlowConfigSchema>;

// ── agent-run endpoint I/O ───────────────────────────────────────────────────────

export const boardAgentRunBodySchema = z.object({
  flow: boardAiTaskSchema,
  cardContext: boardFlowCardContextSchema,
});
export type BoardAgentRunBody = z.infer<typeof boardAgentRunBodySchema>;

export const boardAgentRunResponseSchema = z.object({ taskId: z.string() });
export type BoardAgentRunResponse = z.infer<typeof boardAgentRunResponseSchema>;

// Status polling — the client polls this after starting a run, and links the
// resulting document into the card (client-side, so it goes through the live Yjs
// session like a manual link) once status === 'completed'.
export const boardAgentTaskStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export type BoardAgentTaskStatus = z.infer<typeof boardAgentTaskStatusSchema>;

export const boardAgentRunStatusResponseSchema = z.object({
  status: boardAgentTaskStatusSchema,
  documentId: z.string().nullable(),
  documentTitle: z.string().nullable(),
});
export type BoardAgentRunStatusResponse = z.infer<typeof boardAgentRunStatusResponseSchema>;

export const boardAgentErrorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});
