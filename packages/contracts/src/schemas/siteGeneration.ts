import { z } from 'zod';

import { LEGAL_EMAIL_MAX } from './sites.js';
import { websiteContentSchema } from './texte.js';

export const WEBSITE_DESCRIPTION_MIN = 50;
export const WEBSITE_DESCRIPTION_MAX = 5000;
export const SITE_FLYER_FIELD = 'flyer';
export const SITE_FLYER_MAX_BYTES = 20 * 1024 * 1024;

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

export const siteGenerationEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), steps: z.array(siteGenerationStepSchema).min(1) }),
  z.object({ type: z.literal('step'), step: siteGenerationStepSchema }),
  z.object({ type: z.literal('done'), content: websiteContentSchema }),
  z.object({ type: z.literal('error'), message: z.string(), retryable: z.boolean() }),
  z.object({ type: z.literal('heartbeat') }),
]);
export type SiteGenerationEvent = z.infer<typeof siteGenerationEventSchema>;
