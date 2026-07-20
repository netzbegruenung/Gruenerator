/**
 * Zod schemas for /api/auth/custom_prompts and /api/auth/saved_prompts.
 *
 * Source of truth for the user-prompt CRUD surface. The shape mirrors the
 * `custom_prompts` Drizzle table (apps/api/database/schema/generators.ts),
 * plus the owner/saved metadata that the `saved_prompts` join adds. Timestamps
 * arrive as ISO strings over the wire (res.json serialises Date → string).
 */
import { z } from 'zod';

export const customPromptSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  prompt: z.string(),
  description: z.string().nullable(),
  is_public: z.boolean(),
  is_active: z.boolean(),
  usage_count: z.number(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
  // Present only on `saved_prompts` list rows (the join to the owner profile).
  owner_id: z.string().nullable().optional(),
  owner_first_name: z.string().nullable().optional(),
  owner_last_name: z.string().nullable().optional(),
  saved_at: z.string().nullable().optional(),
});
export type CustomPrompt = z.infer<typeof customPromptSchema>;

// ── Request bodies ────────────────────────────────────────────────────────────

export const createCustomPromptBodySchema = z.object({
  prompt: z.string(),
  is_public: z.boolean().optional(),
});
export type CreateCustomPromptBody = z.infer<typeof createCustomPromptBodySchema>;

export const updateCustomPromptBodySchema = z.object({
  prompt: z.string().optional(),
  is_public: z.boolean().optional(),
});
export type UpdateCustomPromptBody = z.infer<typeof updateCustomPromptBodySchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

export const promptListResponseSchema = z.object({
  success: z.literal(true),
  prompts: z.array(customPromptSchema),
});
export type PromptListResponse = z.infer<typeof promptListResponseSchema>;

export const promptMutationResponseSchema = z.object({
  success: z.literal(true),
  prompt: customPromptSchema.nullable(),
  message: z.string(),
});
export type PromptMutationResponse = z.infer<typeof promptMutationResponseSchema>;

export const promptMessageResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});
export type PromptMessageResponse = z.infer<typeof promptMessageResponseSchema>;

export const promptErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});
export type PromptErrorResponse = z.infer<typeof promptErrorResponseSchema>;
