/**
 * Zod schemas for the item-usage read endpoint.
 * Mirrors apps/api/routes/usage/itemUsageContractRouter.ts.
 *
 * Exposes a user's per-item usage aggregate so static client lists (system
 * notebooks / agents) can apply the same "favourites first" ordering the
 * server applies to user notebooks / agents.
 */
import { z } from 'zod';

export const itemUsageTypeSchema = z.enum(['notebook', 'agent']);

export const itemUsageStatSchema = z.object({
  item_id: z.string(),
  use_count: z.number(),
  last_used_at: z.union([z.string(), z.date()]),
});

export const getItemUsageResponseSchema = z.object({
  success: z.literal(true),
  type: itemUsageTypeSchema,
  items: z.array(itemUsageStatSchema),
});

export const itemUsageErrorResponseSchema = z.object({
  error: z.string(),
});

export type ItemUsageStatDto = z.infer<typeof itemUsageStatSchema>;
