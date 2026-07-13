import { z } from 'zod';

/**
 * Wire payloads for the combined social-media-post chat tool (post text +
 * sharepic variants). The sharepic half travels via the existing
 * `sharepic_complete` machinery; these schemas cover only the text half.
 * Single source of truth for the Express emitters (apps/api `sseHelpers.ts`),
 * the chat runtime parser (packages/chat `parseSSEStream.ts`) and the
 * persisted `social_post` tool-call result on chat messages.
 */

export const socialPlatformSchema = z.enum([
  'instagram',
  'facebook',
  'twitter',
  'linkedin',
  'generic',
]);
export type SocialPlatform = z.infer<typeof socialPlatformSchema>;

export const socialPostPayloadSchema = z.object({
  /** Client-side identity of the post within the thread (analogous to variantId). */
  postId: z.string(),
  platform: socialPlatformSchema,
  /** Full post text including hashtags, exactly as the user would paste it. */
  text: z.string(),
  hashtags: z.array(z.string()),
  charCount: z.number(),
  /** 1 on creation; incremented by chat text edits. */
  version: z.number(),
});
export type SocialPostPayload = z.infer<typeof socialPostPayloadSchema>;

/** One historical text state, appended on every chat edit. */
export const socialPostVersionSchema = z.object({
  text: z.string(),
  hashtags: z.array(z.string()),
  charCount: z.number(),
  version: z.number(),
  summary: z.string(),
  createdAt: z.string(),
});
export type SocialPostVersion = z.infer<typeof socialPostVersionSchema>;

/**
 * Shape persisted as the `social_post` tool-call result on the assistant
 * message: current head fields + full version history for the stepper.
 */
export const socialPostToolResultSchema = socialPostPayloadSchema.extend({
  versions: z.array(socialPostVersionSchema),
});
export type SocialPostToolResult = z.infer<typeof socialPostToolResultSchema>;

export interface SocialPlatformInfo {
  label: string;
  /** Hard platform limit — the card shows a red counter above this. */
  maxChars: number;
  /** Sweet spot the generation prompt targets. */
  recommendedChars: number;
}

/**
 * Single source for platform labels and character budgets, used by the
 * backend generation/edit prompts AND the frontend char-count meter.
 */
export const SOCIAL_PLATFORM_INFO: Record<SocialPlatform, SocialPlatformInfo> = {
  instagram: { label: 'Instagram', maxChars: 2200, recommendedChars: 1500 },
  facebook: { label: 'Facebook', maxChars: 5000, recommendedChars: 800 },
  twitter: { label: 'X/Twitter', maxChars: 280, recommendedChars: 280 },
  linkedin: { label: 'LinkedIn', maxChars: 3000, recommendedChars: 900 },
  generic: { label: 'Social Media', maxChars: 2200, recommendedChars: 1200 },
};
