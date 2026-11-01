import { z } from 'zod';

import { sharepicSpecShapeSchema } from './spec.js';

export const sharepicPhotoAttributionSchema = z.object({
  photographer: z.string(),
  profileUrl: z.string(),
  photoUrl: z.string(),
});
export type SharepicPhotoAttribution = z.infer<typeof sharepicPhotoAttributionSchema>;

export const SHAREPIC_ELEMENT_KINDS = [
  'text',
  'pill',
  'circle',
  'shape',
  'asset',
  'chart',
  'userImage',
  'icon',
] as const;

/** A text's brand font role, as the page stores it (`bind` of an additional text). */
const sharepicFontBindSchema = z.object({
  fontFamily: z.object({ ref: z.string(), value: z.string() }).optional(),
});

/** What the composer wrote for one element; compared against the page to find hand edits. */
export const sharepicFingerprintSchema = z.object({
  kind: z.enum(SHAREPIC_ELEMENT_KINDS),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  fontSize: z.number().optional(),
  fill: z.string().optional(),
  rotation: z.number().optional(),
  scale: z.number().optional(),
  /** Shapes scale on two axes; `scale` holds their x. */
  scaleY: z.number().optional(),
  opacity: z.number().optional(),
  text: z.string().optional(),
  /** Texts only. Added later: a baseline without them predates the font picker (additive, F0). */
  fontFamily: z.string().optional(),
  bind: sharepicFontBindSchema.optional(),
});
export type SharepicFingerprint = z.infer<typeof sharepicFingerprintSchema>;

export const sharepicBackgroundFingerprintSchema = z.object({
  color: z.string().nullable(),
  imageSrc: z.string().nullable(),
  offset: z.object({ x: z.number(), y: z.number() }).nullable(),
  scale: z.number().nullable(),
});
export type SharepicBackgroundFingerprint = z.infer<typeof sharepicBackgroundFingerprintSchema>;

/** Element fingerprints keyed by element id; the background has its own field (ids are free-form). */
export const sharepicBaselineSchema = z.object({
  elements: z.record(z.string(), sharepicFingerprintSchema),
  background: sharepicBackgroundFingerprintSchema,
});
export type SharepicBaseline = z.infer<typeof sharepicBaselineSchema>;

/** F0: the page-state key and `v` are persisted in Yjs documents; change additively only. */
export const SHAREPIC_SOURCE_KEY = 'sharepicSource' as const;

/** Tweak id -> chosen option (see canvas-editor sharepicTweaks). */
export const sharepicTweakChoiceSchema = z.record(z.string(), z.string());

/**
 * Semantic origin of a creator page, stored in its Yjs `state`. `slide` is the
 * BASE (untweaked) one-slide spec; `deck` groups the pages of one carousel.
 */
export const sharepicSourceSchema = z.object({
  v: z.literal(1),
  deck: z.string().guid(),
  // Shape only: a slide cut from a carousel fails the deck-level refinements
  // (seitenzahl, weiter); deckSpec() validates the assembled deck in full.
  slide: sharepicSpecShapeSchema.refine((spec) => spec.slides.length === 1, {
    message: 'slide must hold exactly one slide.',
  }),
  attribution: sharepicPhotoAttributionSchema.nullable(),
  tweaks: sharepicTweakChoiceSchema.optional(),
  baseline: sharepicBaselineSchema,
});
export type SharepicSource = z.infer<typeof sharepicSourceSchema>;
