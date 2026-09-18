/**
 * Zod schemas for the daily "Bäume" budget (`/api/trees`).
 *
 * One per-user daily allowance behind every metered feature — image editing,
 * Voice, DeepL, Deep Research. It replaces the four per-feature quotas those
 * features used to carry, so their responses report the same shape and a
 * client only ever has to render one number.
 *
 * No Node-only types in here: `apps/mobile` bundles the contracts client.
 */
import { z } from 'zod';

export const treeBudgetStatusSchema = z.object({
  /** Bäume used today, fractional (e.g. 2.5). */
  used: z.number(),
  /** Daily allowance in Bäume; null = unlimited (e.g. the bgst instance). */
  limit: z.number().nullable(),
  remaining: z.number().nullable(),
  /** ISO instant of the next reset (UTC midnight); clients render it in local time. */
  resetsAt: z.string(),
  /** True when the +5 newsletter bonus is part of `limit`. */
  newsletterBonus: z.boolean(),
});
export type TreeBudgetStatus = z.infer<typeof treeBudgetStatusSchema>;

export const treeBudgetErrorSchema = z.object({ error: z.string() });
export type TreeBudgetError = z.infer<typeof treeBudgetErrorSchema>;
