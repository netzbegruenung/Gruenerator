/**
 * Zod schemas for the one-click newsletter signup (`/api/newsletter`).
 *
 * The signup uses the address confirmed in the dialog (default: the account address) and starts Brevo's
 * double opt-in: nobody is on the list until they confirm the mail.
 */
import { z } from 'zod';

/** Optional: the address typed in the signup dialog. Without it the account address is used. */
export const newsletterSubscribeBodySchema = z.object({
  email: z.string().trim().email().max(254).optional(),
});

export const newsletterSubscribeStatusSchema = z.enum(['confirmation_sent', 'already_subscribed']);

export const newsletterSubscribeResponseSchema = z.object({
  status: newsletterSubscribeStatusSchema,
});

/** Stable codes the client can branch on; `error` is the German message for the UI. */
export const newsletterErrorCodeSchema = z.enum([
  'no_email',
  'not_configured',
  'brevo_failed',
  'internal',
]);

export const newsletterErrorSchema = z.object({
  code: newsletterErrorCodeSchema,
  error: z.string(),
});

export type NewsletterSubscribeBody = z.infer<typeof newsletterSubscribeBodySchema>;
export type NewsletterSubscribeStatus = z.infer<typeof newsletterSubscribeStatusSchema>;
export type NewsletterSubscribeResponse = z.infer<typeof newsletterSubscribeResponseSchema>;
export type NewsletterErrorCode = z.infer<typeof newsletterErrorCodeSchema>;
export type NewsletterError = z.infer<typeof newsletterErrorSchema>;
