import { z } from 'zod';

import { sharepicBrandSchema, sharepicCreatorLocaleSchema, sharepicFormatSchema } from './enums.js';
import { sharepicFormSchema } from './forms.js';
import { sharepicPatchOpSchema } from './patch.js';
import { sharepicOwnPhotoSchema, sharepicPhotoUrlSchema } from './photos.js';
import { SHAREPIC_UPLOAD_ID, SHAREPIC_UPLOAD_MAX } from './refs.js';
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
  /** Whose design a first draft wears; absent: named in the prompt, else the party's. */
  brand: sharepicBrandSchema.optional(),
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

/**
 * What the creator chose, repaired and left out — one entry per event, so the
 * next turn (and the person) can tell a missing date from a dropped one.
 */
export const sharepicBerichtEintragSchema = z.discriminatedUnion('art', [
  z.object({
    art: z.literal('form'),
    form: sharepicFormSchema,
    von: z.enum(['person', 'creator']),
    /** The form the model first picked, when the brief lacked its material. */
    statt: sharepicFormSchema.optional(),
  }),
  z.object({ art: z.literal('fehlt'), fakt: z.enum(['termin']) }),
  z.object({
    art: z.literal('repariert'),
    feld: z.enum(['datum', 'datum.date', 'datum.time', 'datum.weekday', 'ort']),
    wert: z.string().max(60),
  }),
  z.object({
    art: z.literal('foto'),
    id: z.string().regex(SHAREPIC_UPLOAD_ID),
    status: z.enum([
      'in_szene',
      'collage',
      'freigestellt',
      'ungeschnitten',
      'verwendet',
      'nicht_verwendet',
    ]),
    grund: z.string().max(200).optional(),
  }),
  z.object({ art: z.literal('gestaltung'), text: z.string().max(300) }),
]);
export type SharepicBerichtEintrag = z.infer<typeof sharepicBerichtEintragSchema>;

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
  /** What the draft chose, repaired and left out. */
  bericht: z.array(sharepicBerichtEintragSchema).max(20).optional(),
});
export type SharepicDraftResponse = z.infer<typeof sharepicDraftResponseSchema>;

/** How many fitting Seiten the page picker hands over for „Mit KI hinzufügen". */
export const SHAREPIC_NEXT_SEITE_CANDIDATES_MAX = 12;

/** The longest design text that goes along — the client cuts its pages to this. */
export const SHAREPIC_DECK_TEXT_MAX = 6_000;

export const sharepicNextSeiteBodySchema = z.object({
  /** Catalogue Seiten ids, the ones most like the design first; unknown ones are dropped. */
  candidates: z.array(z.string().min(1).max(200)).min(1).max(SHAREPIC_NEXT_SEITE_CANDIDATES_MAX),
  /** The design's text so far, page by page. */
  deck: z.string().trim().min(1).max(SHAREPIC_DECK_TEXT_MAX),
  format: sharepicFormatSchema,
  brand: sharepicBrandSchema.optional(),
  locale: sharepicCreatorLocaleSchema.optional(),
});

export const sharepicNextSeiteResponseSchema = z.object({
  /** The candidate the creator picked. */
  seiteId: z.string(),
  /** That Seite as one slide, with its new text. */
  spec: sharepicSpecSchema,
  attributions: z.array(sharepicPhotoAttributionSchema.nullable()),
});
export type SharepicNextSeiteResponse = z.infer<typeof sharepicNextSeiteResponseSchema>;

/** `edit`: the draft was just revised on `prompt` (a change request) — the review must not undo it. */
export const sharepicReviewModeSchema = z.enum(['draft', 'edit']);
export type SharepicReviewMode = z.infer<typeof sharepicReviewModeSchema>;

/**
 * What a chat turn ordered, sent with the sharepic it made (`sharepic_complete`):
 * the browser reviews the rendered sharepic against it, as the studio does.
 */
export const sharepicChatReviewSchema = z.object({
  brief: z.string().trim().min(1).max(SHAREPIC_PROMPT_MAX),
  mode: sharepicReviewModeSchema,
});
export type SharepicChatReview = z.infer<typeof sharepicChatReviewSchema>;

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
  bericht: z.array(sharepicBerichtEintragSchema).max(20).optional(),
  /** The chat's own photos (id → durable library URL); the analysis is recomputed server-side. */
  photos: z
    .array(z.object({ id: z.string().regex(SHAREPIC_UPLOAD_ID), url: sharepicPhotoUrlSchema }))
    .max(SHAREPIC_UPLOAD_MAX)
    .optional(),
  slide: z.number().int().min(0).optional(),
  revisionOf: z.string().optional(),
  editorChangesDropped: z.literal(true).optional(),
});
export type SharepicChatProps = z.infer<typeof sharepicChatPropsSchema>;

export function parseSharepicChatProps(value: unknown): SharepicChatProps | null {
  const parsed = sharepicChatPropsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
