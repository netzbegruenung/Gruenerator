import { z } from 'zod';

import { imageModelIdSchema } from './imageModelPreference.js';

/**
 * Schemas for POST /api/image-edit — FLUX.2 image editing with one or more
 * reference images (multi-reference). Images travel as base64 in the JSON
 * body (repo convention: ts-rest contracts don't model multipart; same
 * pattern as chat attachments).
 */

export const IMAGE_EDIT_MAX_REFERENCES = 8;

export const imageEditMimeTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);

export const imageEditReferenceSchema = z.object({
  name: z.string().min(1).max(255),
  /** MIME type of the encoded image. */
  type: imageEditMimeTypeSchema,
  /** Base64-encoded image bytes (no data-URL prefix). */
  data: z.string().min(1),
});

export const imageEditTypeSchema = z.enum(['universal', 'green-edit', 'ally-maker']);

export const imageEditBodySchema = z.object({
  /** Natural-language edit instruction; may reference "Bild 1", "Bild 2", … */
  instruction: z.string().min(1).max(4000),
  /** Reference images in order: images[0] is the primary image. */
  images: z.array(imageEditReferenceSchema).min(1).max(IMAGE_EDIT_MAX_REFERENCES),
  /** Overrides the user's stored image-model preference for this edit. */
  imageModel: imageModelIdSchema.nullish(),
  editType: imageEditTypeSchema.nullish(),
  precision: z.boolean().nullish(),
});

export const imageEditSuccessSchema = z.object({
  success: z.literal(true),
  image: z.object({
    /** Base64-encoded JPEG result (no data-URL prefix), KI-labeled. */
    base64: z.string(),
    filename: z.string(),
  }),
  /** The structured prompt that was sent to the image model. */
  prompt: z.string(),
  model: imageModelIdSchema,
  usage: z.object({
    count: z.number(),
    remaining: z.number(),
    limit: z.number(),
  }),
});

export const imageEditErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

export const imageEditQuotaErrorSchema = imageEditErrorSchema.extend({
  data: z
    .object({
      count: z.number(),
      remaining: z.number(),
      limit: z.number(),
    })
    .nullish(),
});

export type ImageEditReference = z.infer<typeof imageEditReferenceSchema>;
export type ImageEditBody = z.infer<typeof imageEditBodySchema>;
export type ImageEditSuccess = z.infer<typeof imageEditSuccessSchema>;
export type ImageEditType = z.infer<typeof imageEditTypeSchema>;
