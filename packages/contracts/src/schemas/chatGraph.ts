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
  customSystemPrompt: z.string().nullish(),
  roleName: z.string().nullish(),
});

export const chatResumeBodySchema = z.object({
  threadId: z.string(),
  resume: z.string(),
});

// ── Response schemas ────────────────────────────────────────────────────────

/**
 * SSE endpoints don't return a structured JSON body on success —
 * they stream events. We model the accepted response as an opaque object
 * so ts-rest is satisfied. Actual SSE events are not validated here.
 */
export const sseAcceptedResponseSchema = z.unknown();

export const chatGraphErrorResponseSchema = z.object({
  error: z.string(),
});
