/**
 * Zod schemas for the user's explicit memory ("Gedächtnis").
 *
 * Two kinds only, and the split is what the prompt does with them:
 * `anweisung` is a standing rule the assistant follows on every answer and is
 * therefore ALWAYS in the system prompt; `fakt` is a statement about the person
 * that is injected wholesale while there are few and retrieved semantically
 * once there are many. The DB column `user_memories.kind` is text and checks
 * against exactly these two values.
 */
import { z } from 'zod';

export const memoryKindSchema = z.enum(['anweisung', 'fakt']);
export type MemoryKind = z.infer<typeof memoryKindSchema>;

/** `chat` = the model saved it through the `memory` tool; `manual` = the person
 *  typed it into the settings tab. */
export const memorySourceSchema = z.enum(['chat', 'manual']);
export type MemorySource = z.infer<typeof memorySourceSchema>;

/** Upper bound for one memory. Enforced by the DB check, the service and the
 *  tool schema alike — a memory is one sentence, not a document. */
export const MEMORY_TEXT_MAX_CHARS = 400;

export const userMemorySchema = z.object({
  id: z.string().uuid(),
  kind: memoryKindSchema,
  text: z.string().min(1).max(MEMORY_TEXT_MAX_CHARS),
  source: memorySourceSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
export type UserMemory = z.infer<typeof userMemorySchema>;

// ── HTTP shapes (memoryContract) ─────────────────────────────────────────────

export const memoryListResponseSchema = z.object({
  memories: z.array(userMemorySchema),
});
export type MemoryListResponse = z.infer<typeof memoryListResponseSchema>;

export const createMemoryBodySchema = z.object({
  kind: memoryKindSchema,
  text: z.string().min(1).max(MEMORY_TEXT_MAX_CHARS),
});
export type CreateMemoryBody = z.infer<typeof createMemoryBodySchema>;

export const updateMemoryBodySchema = z.object({
  text: z.string().min(1).max(MEMORY_TEXT_MAX_CHARS),
});
export type UpdateMemoryBody = z.infer<typeof updateMemoryBodySchema>;

export const memoryItemResponseSchema = z.object({
  memory: userMemorySchema,
  /** True when an identical memory already existed and was returned instead. */
  duplicate: z.boolean(),
});

export const memoryExportResponseSchema = z.object({
  exportedAt: z.string(),
  memoryCount: z.number().int(),
  memories: z.array(userMemorySchema),
});

export const memoryOkResponseSchema = z.object({ success: z.literal(true) });
export const memoryErrorResponseSchema = z.object({ message: z.string() });
