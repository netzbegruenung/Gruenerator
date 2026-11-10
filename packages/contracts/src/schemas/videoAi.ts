/**
 * KI-Schnitt: raw footage in, an editable cut out. The backend owns the cut as
 * a versioned plan (EDL); the private video editor compiles it into its own
 * timeline. Persisted EDLs are F0 — every enum value and field name here is
 * frozen once a row carries it; change additively and bump `version` only for
 * a shape the editor must read differently.
 *
 * Optional fields use `.nullish()` (2026-04-12 rule).
 */
import { z } from 'zod';

export const VIDEO_AI_LIMITS = {
  maxClips: 10,
  /** Sum of all footage clips. */
  maxFootageSeconds: 15 * 60,
  maxAssets: 20,
  maxTargetSeconds: 180,
  /** Gemma-written texts on screen; the editor wraps, it does not shrink. */
  maxOverlayTextChars: 80,
  maxOverlays: 20,
} as const;

export const videoAiFormatSchema = z.enum(['9:16', '4:5', '1:1', '16:9']);
export type VideoAiFormat = z.infer<typeof videoAiFormatSchema>;

/** Horizontal position of the person, used to place a narrower crop. */
export const videoAiFramingSchema = z.enum(['links', 'mitte', 'rechts']);
export type VideoAiFraming = z.infer<typeof videoAiFramingSchema>;

/** `nah` is a static punch-in, the classic jump-cut look. */
export const videoAiZoomSchema = z.enum(['normal', 'nah']);
export type VideoAiZoom = z.infer<typeof videoAiZoomSchema>;

/**
 * Caption looks the editor renders (GRUENERATOR_CAPTION_TEMPLATES in the
 * private editor app, all WCAG-checked there). Same keys on both sides.
 */
export const videoAiCaptionTemplateSchema = z.enum([
  'tanne',
  'grashalm',
  'schatten',
  'klar',
  'weiss',
  'balken-schwarz',
  'balken-tanne',
  'weiss-pur',
]);
export type VideoAiCaptionTemplate = z.infer<typeof videoAiCaptionTemplateSchema>;

/** Look of the cut; each id is a style block in apps/api/prompts/video-ai/stile/. */
export const videoAiStyleSchema = z.enum([
  'talking-head-ruhig',
  'talking-head-dynamisch',
  'statement-mit-bild',
]);
export type VideoAiStyle = z.infer<typeof videoAiStyleSchema>;

/** Footage clip ids are `c1`, `c2`, … in upload order. */
export const videoAiClipIdSchema = z.string().regex(/^c\d+$/);

/** A transcript unit (one sentence or one breath) of a clip: `c1.s12`. */
export const videoAiUnitIdSchema = z.string().regex(/^c\d+\.s\d+$/);
export type VideoAiUnitId = z.infer<typeof videoAiUnitIdSchema>;

export const videoAiSegmentSchema = z.object({
  unitId: videoAiUnitIdSchema,
  framing: videoAiFramingSchema.nullish(),
  zoom: videoAiZoomSchema.nullish(),
});
export type VideoAiSegment = z.infer<typeof videoAiSegmentSchema>;

const overlayText = z.string().trim().min(1).max(VIDEO_AI_LIMITS.maxOverlayTextChars);
const segmentIndex = z.number().int().min(0);
const overlaySeconds = z.number().min(0.5).max(15);

/**
 * On-screen elements. Text is always rendered by the editor from a preset in
 * brand type — the model only picks the preset and writes the words. Name and
 * role in the lower third come from the briefing, never from the model.
 */
export const videoAiOverlaySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('titel'),
    preset: z.enum(['hook', 'statement']),
    text: overlayText,
    atSegment: segmentIndex,
    durationSeconds: overlaySeconds,
  }),
  z.object({
    kind: z.literal('bauchbinde'),
    atSegment: segmentIndex,
    durationSeconds: overlaySeconds,
  }),
  z.object({
    kind: z.literal('asset'),
    assetId: z.string().min(1),
    layout: z.enum(['vollbild', 'bild-im-bild', 'sticker']),
    atSegment: segmentIndex,
    durationSeconds: overlaySeconds,
  }),
  z.object({
    /** A silent cutaway from a b-roll clip over the running speech. */
    kind: z.literal('broll'),
    clipId: videoAiClipIdSchema,
    sourceStart: z.number().min(0),
    atSegment: segmentIndex,
    durationSeconds: overlaySeconds,
  }),
  z.object({
    kind: z.literal('logo'),
    placement: z.enum(['ecke', 'abspann']),
  }),
]);
export type VideoAiOverlay = z.infer<typeof videoAiOverlaySchema>;

export const videoAiEdlSchema = z.object({
  version: z.literal(1),
  format: videoAiFormatSchema,
  segments: z.array(videoAiSegmentSchema).min(1),
  captions: z.object({
    enabled: z.boolean(),
    template: videoAiCaptionTemplateSchema.nullish(),
  }),
  overlays: z.array(videoAiOverlaySchema).max(VIDEO_AI_LIMITS.maxOverlays),
  music: z
    .object({
      assetId: z.string().min(1),
      volume: z.enum(['leise', 'mittel']),
    })
    .nullish(),
});
export type VideoAiEdl = z.infer<typeof videoAiEdlSchema>;
