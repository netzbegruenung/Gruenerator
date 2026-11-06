/**
 * Zod schemas for the daily briefing ("Tagesbriefing"): the proactive assistant
 * message a person finds in the chat sidebar on their first visit of the day.
 *
 * The briefing itself is an ordinary chat thread; these schemas only describe
 * the trigger endpoint, the read marker, and the field the thread list carries.
 */
import { z } from 'zod';

/**
 * What `POST /api/briefing/today` did.
 * - `created`: today's thread was just written.
 * - `exists`: today's briefing was already handled (thread or deliberate skip).
 * - `pending`: another tab/device/worker is building it right now.
 * - `skipped`: nothing worth saying today — no thread was written.
 * - `disabled`: switched off in the settings or no AI consent.
 */
export const briefingStatusSchema = z.enum(['created', 'exists', 'pending', 'skipped', 'disabled']);
export type BriefingStatus = z.infer<typeof briefingStatusSchema>;

export const briefingTodayResponseSchema = z.object({
  status: briefingStatusSchema,
  threadId: z.string().nullable(),
  slugSuffix: z.string().nullable(),
});
export type BriefingTodayResponse = z.infer<typeof briefingTodayResponseSchema>;

export const briefingOpenedParamsSchema = z.object({ threadId: z.string().uuid() });

export const briefingOkResponseSchema = z.object({ success: z.literal(true) });

export const briefingErrorResponseSchema = z.object({ message: z.string() });

/** Dev-only re-run (mounted only with the dev auth bypass). */
export const briefingDevRerunBodySchema = z.object({
  simulateNextDay: z.boolean().optional(),
});

/**
 * Carried by a thread-list entry that is a briefing thread. Optional on the
 * thread schema (F0): older servers do not send it.
 */
export const threadBriefingSchema = z.object({
  day: z.string(),
  unread: z.boolean(),
});
export type ThreadBriefing = z.infer<typeof threadBriefingSchema>;
