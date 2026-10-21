import { z } from 'zod';

import { sharepicCreatorLocaleSchema } from './enums.js';
import { sharepicFormSchema } from './forms.js';
import { sharepicPatchOpSchema } from './patch.js';
import { sharepicOwnPhotoSchema } from './photos.js';
import { SHAREPIC_UPLOAD_MAX } from './refs.js';
import { sharepicPhotoAttributionSchema, sharepicTweakChoiceSchema } from './source.js';
import { sharepicSpecSchema } from './spec.js';

/** Longest request the creator takes — long enough to convert a whole press release. */
export const SHAREPIC_PROMPT_MAX = 20_000;

/** The part of a carousel a change request is about: a 0-based slide, optionally composer element ids on it. */
export const sharepicDraftFocusSchema = z.object({
  slide: z.number().int().min(0),
  elements: z.array(z.string()).optional(),
});
export type SharepicDraftFocus = z.infer<typeof sharepicDraftFocusSchema>;

export const sharepicDraftBodySchema = z.object({
  prompt: z.string().trim().min(3).max(SHAREPIC_PROMPT_MAX),
  locale: sharepicCreatorLocaleSchema.optional(),
  /** The draft to change; `prompt` is then the change request. */
  current: sharepicSpecSchema.optional(),
  /** The user's own photos (already analysed) — the only `upload:N` ids a draft may use. */
  photos: z
    .array(sharepicOwnPhotoSchema)
    .max(SHAREPIC_UPLOAD_MAX)
    .refine((photos) => new Set(photos.map((p) => p.id)).size === photos.length, 'doppelte id')
    .optional(),
  /** A form picked from the offered alternatives; otherwise the request's wording decides. */
  form: sharepicFormSchema.optional(),
  /** With `current`: the slide (and elements) the change request is about. */
  focus: sharepicDraftFocusSchema.optional(),
});

export const sharepicDraftResponseSchema = z.object({
  spec: sharepicSpecSchema,
  /** Chapters the model asked for — shown in the UI so the knowledge path stays visible. */
  chapters: z.array(z.string()),
  /** Photo credit per slide, `null` on a colour slide. */
  attributions: z.array(sharepicPhotoAttributionSchema.nullable()),
  /** One sentence for the user when the draft fell short of the request (no painted scene). */
  hinweis: z.string().max(300).optional(),
  /** The form the draft was built as — named in the request or chosen by the creator. */
  form: sharepicFormSchema.optional(),
  /** Two other forms that would suit the request. */
  alternativen: z.array(sharepicFormSchema).max(2).optional(),
});
export type SharepicDraftResponse = z.infer<typeof sharepicDraftResponseSchema>;

/** `edit`: the draft was just revised on `prompt` (a change request) — the review must not undo it. */
export const sharepicReviewModeSchema = z.enum(['draft', 'edit']);
export type SharepicReviewMode = z.infer<typeof sharepicReviewModeSchema>;

export const sharepicReviewBodySchema = z.object({
  spec: sharepicSpecSchema,
  prompt: z.string().trim().min(1).max(SHAREPIC_PROMPT_MAX),
  /** PNG/JPEG data URL of the rendered draft — a carousel as one contact sheet. */
  image: z.string().startsWith('data:image/').max(8_000_000),
  mode: sharepicReviewModeSchema.optional(),
});

export const sharepicReviewResponseSchema = z.object({
  ok: z.boolean(),
  issues: z.array(z.string()),
  patch: z.array(sharepicPatchOpSchema),
});
export type SharepicReviewResponse = z.infer<typeof sharepicReviewResponseSchema>;

/** A content limit the draft kept breaking; `error` then names it for the person. */
export const sharepicDraftFailureReasonSchema = z.enum([
  'headline_line_too_long',
  'carousel_slide_count',
]);
export type SharepicDraftFailureReason = z.infer<typeof sharepicDraftFailureReasonSchema>;

export const sharepicCreatorErrorSchema = z.object({
  error: z.string(),
  reason: sharepicDraftFailureReasonSchema.optional(),
});
export type SharepicCreatorError = z.infer<typeof sharepicCreatorErrorSchema>;

/**
 * A creator sharepic as the chat carries it (`SharepicVariant.initialProps`).
 * The server only has the spec; every renderer composes it in the browser.
 * `slide` picks the page of a carousel, `revisionOf` names the variant this one
 * revises, `editorChangesDropped` marks a revision of a sharepic that had been
 * opened in the editor.
 */
export const sharepicChatPropsSchema = z.object({
  creatorSpec: sharepicSpecSchema,
  /** The untweaked spec and the choice behind `creatorSpec`, when the minter composes from the tweaked one. */
  creatorBase: sharepicSpecSchema.optional(),
  creatorTweaks: sharepicTweakChoiceSchema.optional(),
  attributions: z.array(sharepicPhotoAttributionSchema.nullable()),
  slide: z.number().int().min(0).optional(),
  revisionOf: z.string().optional(),
  editorChangesDropped: z.literal(true).optional(),
});
export type SharepicChatProps = z.infer<typeof sharepicChatPropsSchema>;

export function parseSharepicChatProps(value: unknown): SharepicChatProps | null {
  const parsed = sharepicChatPropsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
