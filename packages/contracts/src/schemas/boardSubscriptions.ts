/**
 * Zod schemas for card watchers / subscriptions (board cards).
 *
 * A subscription lets a user receive notifications about a card without being an
 * assignee. Auto-created when a user comments on or is assigned to a card.
 */
import { z } from 'zod';

export const subscriptionSourceSchema = z.enum(['manual', 'comment', 'assignment']);
export type SubscriptionSource = z.infer<typeof subscriptionSourceSchema>;

export const cardSubscriptionStatusSchema = z.object({
  subscribed: z.boolean(),
  count: z.number(),
});
export type CardSubscriptionStatus = z.infer<typeof cardSubscriptionStatusSchema>;

export const subscriptionSuccessResponseSchema = z.object({ success: z.literal(true) });
export const boardSubscriptionErrorResponseSchema = z.object({ error: z.string() });
