/**
 * Zod schemas for the one-click newsletter signup (`/api/newsletter`).
 *
 * The signup uses the signed-in person's account address and starts Brevo's
 * double opt-in: nobody is on the list until they confirm the mail.
 */
import { z } from 'zod';

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

export type NewsletterSubscribeStatus = z.infer<typeof newsletterSubscribeStatusSchema>;
export type NewsletterSubscribeResponse = z.infer<typeof newsletterSubscribeResponseSchema>;
export type NewsletterErrorCode = z.infer<typeof newsletterErrorCodeSchema>;
export type NewsletterError = z.infer<typeof newsletterErrorSchema>;
