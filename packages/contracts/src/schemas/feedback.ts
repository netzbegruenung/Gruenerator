/**
 * Zod schemas for the in-app feedback widget.
 *
 * Feedback is fire-and-forget: submitting emails the operator (no DB row).
 * The page context is client-collected metadata (URL, route, browser) so the
 * operator can reproduce the reported situation; no form-field contents are
 * captured. The optional screenshot is a base64 data URL of the current page.
 */
import { z } from 'zod';

export const feedbackPageContextSchema = z.object({
  url: z.string(),
  pathname: z.string(),
  routeName: z.string().nullish(),
  userAgent: z.string(),
  viewport: z.object({ width: z.number(), height: z.number() }),
  locale: z.string().nullish(),
  appVersion: z.string().nullish(),
});

export const feedbackSubmitSchema = z.object({
  message: z.string().min(1).max(5000),
  feature: z.string().max(200).nullish(),
  pageContext: feedbackPageContextSchema,
  // Base64 data URL of the page screenshot. Capped well below the 50MB JSON
  // body limit — the client downscales to ≤2000px JPEG (q0.8), which stays
  // comfortably under this bound.
  screenshot: z.string().max(12_000_000).nullish(),
});

export const feedbackSubmitResponseSchema = z.object({
  success: z.boolean(),
});

export const feedbackErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

export type FeedbackPageContext = z.infer<typeof feedbackPageContextSchema>;
export type FeedbackSubmit = z.infer<typeof feedbackSubmitSchema>;
export type FeedbackSubmitResponse = z.infer<typeof feedbackSubmitResponseSchema>;
export type FeedbackError = z.infer<typeof feedbackErrorSchema>;
