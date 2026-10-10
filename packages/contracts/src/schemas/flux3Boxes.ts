import { z } from 'zod';

/**
 * Bounding boxes for FLUX 3 Image (docs.bfl.ai/flux_3/flux3_image_bounding_boxes).
 *
 * BFL takes no box parameter: the rows travel inside `prompt`, as the caption
 * or instruction followed by a space and `JSON.stringify(rows)`. Every box is
 * `[top, left, bottom, right]` in integers on a 0–1000 grid that stretches with
 * the frame — y comes first.
 */

const coordinate = z.number().int().min(0).max(1000);

export const flux3BboxSchema = z.tuple([coordinate, coordinate, coordinate, coordinate]);

/** Element names appear as `<id>` in the caption, so they stay token-safe. */
export const flux3ElementIdSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]{0,40}$/, 'Element-IDs: Buchstabe, dann Buchstaben/Ziffern/_');

/** One element of a generated layout, also what element detection returns. */
export const flux3LayoutRowSchema = z.object({
  id: flux3ElementIdSchema,
  bbox: flux3BboxSchema,
  desc: z.string().min(1).max(1000),
});

/** What element detection returns: a layout row plus a short German name for the editor. */
export const flux3DetectedElementSchema = flux3LayoutRowSchema.extend({
  label: z.string().min(1).max(60).optional(),
});

export const flux3LayoutSchema = z.object({
  /** One paragraph about the whole image naming each element as `<id>`. */
  caption: z.string().min(1).max(4000),
  rows: z.array(flux3LayoutRowSchema).min(1).max(40),
});

/**
 * One row of a box edit. The combination says what happens:
 * keep (`from` + equal boxes), move (`from` + different boxes),
 * new (`from: null`, `src_bbox: null`), remove (`tgt_bbox: null`).
 */
export const flux3EditRowSchema = z.object({
  id: flux3ElementIdSchema,
  from: z.literal('ref_image_0').nullable(),
  src_bbox: flux3BboxSchema.nullable(),
  tgt_bbox: flux3BboxSchema.nullable(),
  desc: z.string().min(1).max(1000),
});

export const flux3BoxEditSchema = z.object({
  /** The edit in words, naming the changed elements as `<id>`. */
  instruction: z.string().min(1).max(4000),
  rows: z.array(flux3EditRowSchema).min(1).max(40),
});

export type Flux3Bbox = z.infer<typeof flux3BboxSchema>;
export type Flux3LayoutRow = z.infer<typeof flux3LayoutRowSchema>;
export type Flux3DetectedElement = z.infer<typeof flux3DetectedElementSchema>;
export type Flux3Layout = z.infer<typeof flux3LayoutSchema>;
export type Flux3EditRow = z.infer<typeof flux3EditRowSchema>;
export type Flux3BoxEdit = z.infer<typeof flux3BoxEditSchema>;
