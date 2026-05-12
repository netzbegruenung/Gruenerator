/**
 * Zod schemas for email-utility endpoints (test send, etc.).
 *
 * The transactional emails fired by the notification dispatcher
 * (services/notifications/NotificationService.ts) are NOT contracted here —
 * they're triggered internally, not from a typed HTTP call. This contract
 * covers only user-facing email actions exposed at /api/email/*.
 */
import { z } from 'zod';

export const emailTestResponseSchema = z.object({
  success: z.boolean(),
  configured: z.boolean(),
  recipientEmail: z.string().nullish(),
});

export const emailTestErrorResponseSchema = z.object({
  success: z.literal(false),
  configured: z.boolean().optional(),
  error: z.string(),
});

export type EmailTestResponse = z.infer<typeof emailTestResponseSchema>;
export type EmailTestErrorResponse = z.infer<typeof emailTestErrorResponseSchema>;
