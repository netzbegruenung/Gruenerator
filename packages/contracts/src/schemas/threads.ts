/**
 * Zod schemas for chat thread endpoints.
 * Consumed by threadsContract + the ts-rest threadsContractRouter (the sole
 * handler for /api/chat-service/threads).
 */
import { z } from 'zod';

// ── Shared sub-schemas ──────────────────────────────────────────────────────

export const lastMessageSchema = z.object({
  content: z.string(),
  role: z.string(),
  created_at: z.string(), // ISO date string over the wire
});

export const threadSchema = z.object({
  id: z.string(),
  userId: z.string(),
  agentId: z.string(),
  title: z.string().nullable(),
  status: z.string(),
  threadType: z.string(),
  notebookCollectionId: z.string().nullable(),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(), // ISO date string
  updatedAt: z.string(),
  lastMessage: lastMessageSchema.nullable().optional(),
});

// ── Request bodies ──────────────────────────────────────────────────────────

export const createThreadBodySchema = z.object({
  title: z.string().optional(),
  agentId: z.string().optional(),
  threadType: z.string().optional(),
});

export const patchThreadBodySchema = z.object({
  threadId: z.string(),
  title: z.string().optional(),
  status: z.enum(['regular', 'archived']).optional(),
  tags: z.array(z.string()).optional(),
});

export const patchThreadSettingsBodySchema = z.object({
  customSystemPrompt: z.string().nullable().optional(),
  customEnabledTools: z.record(z.boolean()).nullable().optional(),
});

// ── Response schemas ────────────────────────────────────────────────────────

export const threadListResponseSchema = z.array(threadSchema);

export const createThreadResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  agentId: z.string(),
  title: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const patchThreadResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  agentId: z.string(),
  title: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const threadSettingsResponseSchema = z.object({
  customSystemPrompt: z.string().nullable(),
  customEnabledTools: z.record(z.boolean()).nullable(),
});

export const generateTitleResponseSchema = z.object({
  status: z.enum(['accepted', 'skipped']),
  reason: z.string().optional(),
});

export const errorResponseSchema = z.object({
  error: z.string(),
});

export const successResponseSchema = z.object({
  success: z.literal(true),
});

/** Raw bytes (base64) of a thread's tabular attachments, used to rehydrate the
 *  in-browser pandas interpreter after a reload. */
export const tabularFileSchema = z.object({
  name: z.string(),
  mimeType: z.string(),
  data: z.string(),
});

export const tabularFilesResponseSchema = z.object({
  files: z.array(tabularFileSchema),
});
