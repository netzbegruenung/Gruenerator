/**
 * Zod schemas for chat-graph endpoints.
 * Mirrors the schemas in apps/api/routes/chat/chatGraphController.ts — keep in sync.
 *
 * Note: Both /stream and /resume endpoints use SSE (Server-Sent Events) for
 * their responses, so the response schemas here only model the HTTP-level
 * body returned on validation errors or early exits. The actual streaming
 * data is opaque from a ts-rest contract perspective.
 */
import { z } from 'zod';

import { currentBoardSchema } from './boards.js';

// ── Shared sub-schemas ──────────────────────────────────────────────────────

/**
 * Reference to a single file inside a user's connected Wolke (Nextcloud)
 * share link. Selected via the @wolke mentionable in chat; resolved
 * server-side at send-time by downloading the file via WebDAV.
 */
export const wolkeFileRefSchema = z.object({
  shareLinkId: z.string(),
  path: z.string(),
  name: z.string(),
});
export type WolkeFileRef = z.infer<typeof wolkeFileRefSchema>;

/**
 * Reference to a single file inside a user's Nango-connected provider account
 * (Microsoft / Google / Jira / Confluence). Selected via the @connect
 * mentionable in chat; resolved server-side at send-time by downloading the
 * file content via the matching provider API client. No DB / Qdrant
 * persistence — transient per-turn context, mirroring wolkeFileRefSchema.
 */
export const connectFileRefSchema = z.object({
  provider: z.string(),
  fileId: z.string(),
  name: z.string(),
  mimeType: z.string().nullish(),
});
export type ConnectFileRef = z.infer<typeof connectFileRefSchema>;

// ── Request bodies ──────────────────────────────────────────────────────────
//
// All optional fields use `.nullish()` (= `.optional().nullable()`) so they
// accept both `undefined` and `null`. The frontend follows the project's
// `feedback_no_undefined` convention and sends `null` for unset values, so
// plain `.optional()` (which only accepts `undefined`) would 400 every
// request. Handler code uses `?? undefined` at call sites that need
// `T | undefined` (it's only ~3 fields, so a transform helper is overkill).

export const chatStreamBodySchema = z.object({
  messages: z.array(z.unknown()),
  agentId: z.string().nullish(),
  threadId: z.string().nullish(),
  enabledTools: z.record(z.boolean()).nullish(),
  modelId: z.string().nullish(),
  attachments: z.array(z.unknown()).nullish(),
  notebookIds: z.array(z.string()).nullish(),
  forcedTools: z.array(z.string()).nullish(),
  documentIds: z.array(z.string()).nullish(),
  textIds: z.array(z.string()).nullish(),
  documentChatIds: z.array(z.string()).nullish(),
  documentChatMode: z.boolean().nullish(),
  attachmentContext: z.string().nullish(),
  defaultNotebookId: z.string().nullish(),
  boardIds: z.array(z.string()).nullish(),
  docMentionIds: z.array(z.string()).nullish(),
  wolkeFiles: z.array(wolkeFileRefSchema).nullish(),
  connectFiles: z.array(connectFileRefSchema).nullish(),
  currentDocument: z
    .object({
      id: z.string(),
      title: z.string().nullish(),
      markdown: z.string(),
      selectionText: z.string().nullish(),
    })
    .nullish(),
  // Live board state injected by the boards assistant surface (FAB on the boards
  // page). Primary context for board Q&A and the edit_current_board intent.
  currentBoard: currentBoardSchema.nullish(),
  customSystemPrompt: z.string().nullish(),
  roleName: z.string().nullish(),
  // Seed for a brand-new thread: the generated text (Antrag, PM, Social) the
  // user came to chat about. Backend persists it as the first assistant
  // message of the newly created thread so it survives reloads. Ignored when
  // threadId is set (i.e. not a new-thread request).
  initialAssistantMessage: z.string().max(50_000).nullish(),
  // Mention key of the currently-active skill (e.g. 'instagram', 'presse',
  // 'twitter'). When set, the backend looks up the skill in SKILLS and
  // appends its `skillSystemPrompt` to the agent's systemRole for this turn,
  // so platform-specific spec only loads when the relevant skill is active.
  activeSkillMention: z.string().nullish(),
});

export const chatResumeBodySchema = z.object({
  threadId: z.string(),
  resume: z.string(),
});

// ── Response schemas ────────────────────────────────────────────────────────

// SSE success responses are declared as c.noBody() in chatGraphContract.ts —
// see that file for why. Only the error shape needs a schema.
export const chatGraphErrorResponseSchema = z.object({
  error: z.string(),
});
