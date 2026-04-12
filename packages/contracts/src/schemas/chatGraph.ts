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

export const chatStreamBodySchema = z.object({
  messages: z.array(z.unknown()),
  agentId: z.string().optional(),
  threadId: z.string().optional(),
  enabledTools: z.record(z.boolean()).optional(),
  modelId: z.string().optional(),
  attachments: z.array(z.unknown()).optional(),
  notebookIds: z.array(z.string()).optional(),
  forcedTools: z.array(z.string()).optional(),
  documentIds: z.array(z.string()).optional(),
  textIds: z.array(z.string()).optional(),
  documentChatIds: z.array(z.string()).optional(),
  documentChatMode: z.boolean().optional(),
  defaultNotebookId: z.string().optional(),
  boardIds: z.array(z.string()).optional(),
  docMentionIds: z.array(z.string()).optional(),
  customSystemPrompt: z.string().optional(),
  roleName: z.string().optional(),
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
