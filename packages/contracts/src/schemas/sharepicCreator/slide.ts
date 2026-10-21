import { z } from 'zod';

import {
  sharepicAlignSchema,
  sharepicColorSchema,
  sharepicNummerSchema,
  sharepicPositionSchema,
  sharepicTextSideSchema,
} from './enums.js';
import { sharepicItemSchema } from './items.js';
import { SHAREPIC_LIMITS } from './limits.js';
import { line } from './primitives.js';
import { sharepicPhotoFilenameSchema } from './refs.js';

export const sharepicBackgroundSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('farbe'),
    color: sharepicColorSchema,
    /**
     * DE: a band in this colour behind the items above the slide's card (a
     * list, chart, comparison …); `color` is the ground the card stands on.
     */
    kopfband: sharepicColorSchema.optional(),
  }),
  z.object({
    kind: z.literal('foto'),
    filename: sharepicPhotoFilenameSchema,
    /** Where the text sits on the photo; that side gets a darkening gradient. */
    textSeite: sharepicTextSideSchema,
  }),
  z.object({
    kind: z.literal('foto-oben'),
    filename: sharepicPhotoFilenameSchema,
    panelColor: sharepicColorSchema,
  }),
  /** Text on the brand colour above, the photo below fading into it. */
  z.object({
    kind: z.literal('foto-unten'),
    filename: sharepicPhotoFilenameSchema,
    panelColor: sharepicColorSchema,
  }),
]);
export type SharepicBackground = z.infer<typeof sharepicBackgroundSchema>;

/** One page: one text group on one background, plus a few extras. */
export const sharepicSlideSchema = z.object({
  background: sharepicBackgroundSchema,
  position: sharepicPositionSchema,
  align: sharepicAlignSchema,
  items: z.array(sharepicItemSchema).min(1).max(6),
  stoerer: z.object({ text: line(SHAREPIC_LIMITS.stoerer) }).optional(),
  // Only what the request names: the circle reads what is there. „Am 14. März"
  // names no weekday — a date alone still makes a circle.
  datum: z
    .object({
      weekday: line(12).optional(),
      date: line(12).optional(),
      time: line(12).optional(),
    })
    .refine((d) => d.weekday !== undefined || d.date !== undefined, {
      message: 'datum braucht weekday oder date',
    })
    .optional(),
  ort: z.object({ lines: z.array(line(SHAREPIC_LIMITS.ortLine)).min(1).max(2) }).optional(),
  logo: z.boolean(),
  /** DE only: every line in its own box — the story slides on photos. */
  zeilenboxen: z.boolean().optional(),
  /** DE only: a large faded sunflower in the ground's tone, cut by the corner (a colour slide). */
  blume: z.boolean().optional(),
  /** Where a number on the slide comes from, small at the bottom. */
  quelle: line(SHAREPIC_LIMITS.quelle).optional(),
  /** A point per slide: the composer counts the numbered slides and sets the numeral. */
  nummer: sharepicNummerSchema.optional(),
  /** Carousel: a teaser beside the "swipe on" arrow ("Denn →", "Und jetzt?"). Never on the last slide. */
  weiter: line(SHAREPIC_LIMITS.weiter).optional(),
});
export type SharepicSlide = z.infer<typeof sharepicSlideSchema>;

/** The photo a slide shows and credits: its background's, or its `bild`'s on a colour. */
export function slidePhotoFilename(
  slide: Pick<SharepicSlide, 'background' | 'items'>
): string | null {
  if (slide.background.kind !== 'farbe') return slide.background.filename;
  return slide.items.find((i) => i.type === 'bild')?.quelle ?? null;
}
