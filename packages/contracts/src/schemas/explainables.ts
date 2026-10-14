/**
 * Explainables: a source text (chat turn or notebook answer) re-told in plain
 * language as a fixed-template page with up to three FLUX illustrations,
 * shareable per item and exportable as a tagged PDF.
 *
 * The LLM fills `explainableDraftSchema`; the server adds image status and the
 * source list (copied from the turn's citations, never written by the model)
 * to form the stored `explainableContentSchema`.
 */
import { z } from 'zod';

export const EXPLAINABLE_MAX_IMAGES = 3;

export const explainableShareModeSchema = z.enum(['private', 'authenticated', 'public']);
export type ExplainableShareMode = z.infer<typeof explainableShareModeSchema>;

export const explainableStatusSchema = z.enum(['images_pending', 'ready', 'failed']);
export type ExplainableStatus = z.infer<typeof explainableStatusSchema>;

export const explainableImageStatusSchema = z.enum(['pending', 'done', 'failed']);
export type ExplainableImageStatus = z.infer<typeof explainableImageStatusSchema>;

const draftImageSchema = z.object({
  /** English scene description for FLUX; the server adds the fixed style prefix. */
  prompt: z.string().min(10).max(600),
  /** German alt text, also used as the tagged-PDF /Alt. */
  alt: z.string().min(3).max(300),
});

const draftSectionSchema = z.object({
  heading: z.string().min(1).max(120),
  paragraphs: z.array(z.string().min(1).max(1200)).min(1).max(4),
  image: draftImageSchema.optional(),
});

const glossaryEntrySchema = z.object({
  term: z.string().min(1).max(80),
  definition: z.string().min(1).max(400),
});

export const explainableDraftSchema = z.object({
  title: z.string().min(3).max(120),
  summary: z.string().min(10).max(600),
  sections: z
    .array(draftSectionSchema)
    .min(2)
    .max(6)
    .refine((s) => s.filter((x) => x.image).length <= EXPLAINABLE_MAX_IMAGES, {
      message: `Höchstens ${EXPLAINABLE_MAX_IMAGES} Abschnitte dürfen ein Bild haben.`,
    }),
  keyTakeaways: z.array(z.string().min(1).max(300)).min(2).max(5),
  glossary: z.array(glossaryEntrySchema).max(8).optional(),
});
export type ExplainableDraft = z.infer<typeof explainableDraftSchema>;

export const explainableSourceSchema = z.object({
  index: z.number().int().min(1),
  title: z.string(),
  url: z.string().nullable().optional(),
});
export type ExplainableSource = z.infer<typeof explainableSourceSchema>;

export const explainableSectionSchema = draftSectionSchema.extend({
  image: draftImageSchema.extend({ status: explainableImageStatusSchema }).optional(),
});
export type ExplainableSection = z.infer<typeof explainableSectionSchema>;

export const explainableContentSchema = z.object({
  title: z.string(),
  summary: z.string(),
  sections: z.array(explainableSectionSchema),
  keyTakeaways: z.array(z.string()),
  glossary: z.array(glossaryEntrySchema).optional(),
  sources: z.array(explainableSourceSchema),
});
export type ExplainableContent = z.infer<typeof explainableContentSchema>;

export const explainableDtoSchema = z.object({
  id: z.string(),
  /** Stable 6-char suffix of the owner URL /erklaert/<slug>-<suffix>. */
  slugSuffix: z.string(),
  title: z.string(),
  status: explainableStatusSchema,
  content: explainableContentSchema,
  shareMode: explainableShareModeSchema,
  /** Only sent to the owner; null for viewers and while never shared. */
  shareToken: z.string().nullable(),
  isOwner: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ExplainableDto = z.infer<typeof explainableDtoSchema>;

export const createExplainableBodySchema = z.object({
  messageId: z.string().min(1),
});

export const createExplainableResponseSchema = z.object({
  id: z.string(),
  slugSuffix: z.string(),
  title: z.string(),
});

export const updateExplainableShareBodySchema = z.object({
  shareMode: explainableShareModeSchema,
});

export const explainableShareResponseSchema = z.object({
  shareMode: explainableShareModeSchema,
  shareToken: z.string().nullable(),
});

export const explainableErrorSchema = z.object({
  error: z.string(),
  /** Set on 401 from the shared endpoint so the page can show a login hint. */
  share_mode: explainableShareModeSchema.optional(),
});
