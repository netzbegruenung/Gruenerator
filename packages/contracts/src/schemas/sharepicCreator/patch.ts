import { z } from 'zod';

import {
  sharepicAlignSchema,
  sharepicColorSchema,
  sharepicPositionSchema,
  sharepicTextSideSchema,
} from './enums.js';
import { sharepicAccentSchema } from './primitives.js';

/**
 * What the vision review may change. A slide is addressed by its index in
 * `spec.slides` (default 0), an item by its index in that slide's `items` —
 * the review sees the spec with indices, nothing else.
 */
const onSlide = { slide: z.number().int().min(0).optional() };
export const sharepicPatchOpSchema = z.discriminatedUnion('op', [
  z.object({
    ...onSlide,
    op: z.literal('set_text'),
    item: z.number().int().min(0),
    text: z.string().trim().min(1),
  }),
  z.object({
    ...onSlide,
    op: z.literal('set_headline'),
    /** Turns this item into the headline — for a slide that has none yet. */
    item: z.number().int().min(0).optional(),
    lines: z.array(z.string().trim().min(1)).min(1),
    akzent: sharepicAccentSchema.optional(),
  }),
  z.object({ ...onSlide, op: z.literal('remove_item'), item: z.number().int().min(0) }),
  z.object({ ...onSlide, op: z.literal('set_position'), position: sharepicPositionSchema }),
  z.object({ ...onSlide, op: z.literal('set_align'), align: sharepicAlignSchema }),
  z.object({ ...onSlide, op: z.literal('set_text_side'), textSeite: sharepicTextSideSchema }),
  z.object({ ...onSlide, op: z.literal('set_color'), color: sharepicColorSchema }),
  /** Drop a photo that does not fit and use a brand colour instead. */
  z.object({ ...onSlide, op: z.literal('use_color'), color: sharepicColorSchema }),
  z.object({
    ...onSlide,
    op: z.literal('remove_extra'),
    extra: z.enum(['stoerer', 'datum', 'ort', 'logo', 'quelle']),
  }),
]);
export type SharepicPatchOp = z.infer<typeof sharepicPatchOpSchema>;
