/**
 * Zod schemas for „Zu meinen Grüneratoren" — the agents and recipes a person
 * added from the Agentura to their overview.
 * Mirrors apps/api/routes/userLibrary/userLibraryContractRouter.ts.
 */
import { z } from 'zod';

/** F0: persisted in `user_library_items.item_kind`. */
export const userLibraryItemKindSchema = z.enum(['agent', 'recipe']);
export type UserLibraryItemKind = z.infer<typeof userLibraryItemKindSchema>;

/**
 * agentRef for agents (system identifier or user-agent uuid); for recipes the
 * catalogue mention or, for a user's public recipe, its row uuid — mentions of
 * user recipes are not unique across owners. All of these are lowercase slugs
 * or uuids, so anything else is rejected at the door.
 */
export const userLibraryItemRefSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,199}$/i, 'Ungültiger Verweis');

/** How many items one person can add — far above real use, a ceiling against scripted junk. */
export const USER_LIBRARY_MAX_ITEMS = 500;

export const userLibraryItemSchema = z.object({
  kind: userLibraryItemKindSchema,
  ref: userLibraryItemRefSchema,
  createdAt: z.string(),
});
export type UserLibraryItem = z.infer<typeof userLibraryItemSchema>;

export const userLibraryItemParamsSchema = z.object({
  kind: userLibraryItemKindSchema,
  ref: userLibraryItemRefSchema,
});

export const listUserLibraryResponseSchema = z.object({
  success: z.literal(true),
  items: z.array(userLibraryItemSchema),
});

export const userLibraryMutationResponseSchema = z.object({
  success: z.literal(true),
});

export const userLibraryErrorResponseSchema = z.object({
  error: z.string(),
});
