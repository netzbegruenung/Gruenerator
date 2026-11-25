import { z } from 'zod';

import { LEGAL_EMAIL_MAX } from './sites.js';
import { websiteContentSchema } from './texte.js';

export const WEBSITE_DESCRIPTION_MIN = 50;
export const WEBSITE_DESCRIPTION_MAX = 5000;
export const SITE_FLYER_FIELD = 'flyer';
export const SITE_FLYER_MAX_BYTES = 20 * 1024 * 1024;
export const SITE_FLYER_MAX_PAGES = 100;

export const siteGenerateBodySchema = z.object({
  description: z
    .string()
    .trim()
    .min(WEBSITE_DESCRIPTION_MIN)
    .max(WEBSITE_DESCRIPTION_MAX)
    .optional(),
  email: z.union([z.literal(''), z.string().trim().max(LEGAL_EMAIL_MAX).email()]).optional(),
});
export type SiteGenerateBody = z.infer<typeof siteGenerateBodySchema>;

export const SITE_GENERATION_STEPS = ['extract', 'analyze', 'write', 'images'] as const;
export const siteGenerationStepSchema = z.enum(SITE_GENERATION_STEPS);
export type SiteGenerationStep = z.infer<typeof siteGenerationStepSchema>;

/** At most this many themes and actions, in a draft and in the finished content. */
export const SITE_DRAFT_SECTION_ITEMS = 3;

const draftText = z.string();

/**
 * The site content while the model is still writing it: every field may be
 * missing or cut off mid-word, and nothing is validated beyond its shape. The
 * client shows it as it comes and replaces it with `done.content`; it is never
 * stored. Contact e-mail and action links are not part of it — the server
 * fills those in, and a half-written link must not render as a link.
 */
export const siteContentDraftSchema = z.object({
  hero: z.object({ heading: draftText, text: draftText }).partial().optional(),
  about: z.object({ title: draftText, content: draftText }).partial().optional(),
  hero_image: z
    .object({ title: draftText, subtitle: draftText, imageUrl: draftText })
    .partial()
    .optional(),
  themes: z
    .array(z.object({ title: draftText, content: draftText, imageUrl: draftText }).partial())
    .max(SITE_DRAFT_SECTION_ITEMS)
    .optional(),
  actions: z
    .array(z.object({ text: draftText, imageUrl: draftText }).partial())
    .max(SITE_DRAFT_SECTION_ITEMS)
    .optional(),
  contact: z.object({ title: draftText, backgroundImageUrl: draftText }).partial().optional(),
});
export type SiteContentDraft = z.infer<typeof siteContentDraftSchema>;

export const siteGenerationEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), steps: z.array(siteGenerationStepSchema).min(1) }),
  z.object({ type: z.literal('step'), step: siteGenerationStepSchema }),
  /** Added 25.11.2026. Clients built before ignore it: `parseFrame` drops any
   *  frame its own schema does not know. */
  z.object({ type: z.literal('partial'), content: siteContentDraftSchema }),
  z.object({ type: z.literal('done'), content: websiteContentSchema }),
  z.object({ type: z.literal('error'), message: z.string(), retryable: z.boolean() }),
  z.object({ type: z.literal('heartbeat') }),
]);
export type SiteGenerationEvent = z.infer<typeof siteGenerationEventSchema>;
