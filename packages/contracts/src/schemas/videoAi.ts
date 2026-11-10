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

export const videoAiCaptionFixSchema = z.object({
  unitId: videoAiUnitIdSchema,
  /** Source start of the word, seconds — as in the timeline's `words`. */
  start: z.number().min(0),
  text: z.string().trim().min(1).max(40),
});
export type VideoAiCaptionFix = z.infer<typeof videoAiCaptionFixSchema>;

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
  /**
   * Caption words the transcription got wrong, corrected by the person. Keyed
   * by the word's source start time inside its unit; the timing stays.
   */
  captionFixes: z.array(videoAiCaptionFixSchema).max(200).nullish(),
});
export type VideoAiEdl = z.infer<typeof videoAiEdlSchema>;

// ---------------------------------------------------------------------------
// Projects: one KI-Schnitt job from upload to editable cut.
// ---------------------------------------------------------------------------

/**
 * What a Mediathek item is in the cut. Clips (`footage`, `broll`) get ids
 * `c1`, `c2`, …; everything else `a1`, `a2`, … — in the order sent.
 */
export const videoAiInputRoleSchema = z.enum(['footage', 'broll', 'image', 'logo', 'audio']);
export type VideoAiInputRole = z.infer<typeof videoAiInputRoleSchema>;

export const videoAiInputSchema = z.object({
  mediaId: z.string().guid(),
  role: videoAiInputRoleSchema,
});
export type VideoAiInput = z.infer<typeof videoAiInputSchema>;

export const videoAiBriefSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    /** What the video is about, in the person's words. */
    topic: z.string().trim().min(3).max(500),
    format: videoAiFormatSchema,
    style: videoAiStyleSchema,
    target: z.object({
      minSeconds: z.number().int().min(5).max(VIDEO_AI_LIMITS.maxTargetSeconds),
      maxSeconds: z.number().int().min(5).max(VIDEO_AI_LIMITS.maxTargetSeconds),
    }),
    /** Name and role for the lower third; never written by the model. */
    person: z
      .object({
        name: z.string().trim().min(1).max(80),
        role: z.string().trim().max(80),
      })
      .nullish(),
    /** Names and terms the transcription should spell right. */
    keyterms: z.array(z.string().trim().min(2).max(40)).max(20).nullish(),
    hints: z.string().trim().max(1000).nullish(),
  })
  .refine((b) => b.target.minSeconds <= b.target.maxSeconds, {
    message: 'Die Mindestlänge ist größer als die Höchstlänge.',
    path: ['target'],
  });
export type VideoAiBrief = z.infer<typeof videoAiBriefSchema>;

export const videoAiStatusSchema = z.enum([
  'queued',
  'analyzing',
  'cutting',
  'designing',
  'ready',
  'failed',
  'cancelled',
]);
export type VideoAiStatus = z.infer<typeof videoAiStatusSchema>;

export const createVideoAiProjectBodySchema = z.object({
  brief: videoAiBriefSchema,
  inputs: z
    .array(videoAiInputSchema)
    .min(1)
    .max(VIDEO_AI_LIMITS.maxClips + VIDEO_AI_LIMITS.maxAssets),
});
export type CreateVideoAiProjectBody = z.infer<typeof createVideoAiProjectBodySchema>;

export const createVideoAiProjectResponseSchema = z.object({
  id: z.string().guid(),
  slugSuffix: z.string(),
});

export const videoAiProjectInputDtoSchema = videoAiInputSchema.extend({
  /** `c1` / `a1` — the id the plan refers to. */
  id: z.string(),
  title: z.string(),
});

export const videoAiOmittedUnitSchema = z.object({
  unitId: videoAiUnitIdSchema,
  text: z.string(),
  reason: z.string(),
});

export const videoAiVersionSummarySchema = z.object({
  version: z.number().int().min(1),
  summary: z.string(),
  createdAt: z.string(),
});

export const videoAiProjectDtoSchema = z.object({
  id: z.string().guid(),
  slugSuffix: z.string(),
  title: z.string(),
  status: videoAiStatusSchema,
  /** Set when `failed` — a sentence for the person, never a stack trace. */
  error: z.string().nullable(),
  brief: videoAiBriefSchema,
  inputs: z.array(videoAiProjectInputDtoSchema),
  /** Hints about the material (blurry, too quiet, no speech), shown before the plan. */
  warnings: z.array(z.string()),
  version: z.number().int().nullable(),
  edl: videoAiEdlSchema.nullable(),
  versions: z.array(videoAiVersionSummarySchema),
  omitted: z.array(videoAiOmittedUnitSchema),
  /** Why the cut looks like this; or why the plan is the conservative fallback. */
  rationale: z.string().nullable(),
  /** Opened in the editor: from then on the editor's autosave is the truth, no more rounds. */
  handedOff: z.boolean(),
  createdAt: z.string(),
});
export type VideoAiProjectDto = z.infer<typeof videoAiProjectDtoSchema>;

export const videoAiProjectListItemSchema = videoAiProjectDtoSchema.pick({
  id: true,
  slugSuffix: true,
  title: true,
  status: true,
  createdAt: true,
});
export type VideoAiProjectListItem = z.infer<typeof videoAiProjectListItemSchema>;

export const videoAiErrorSchema = z.object({ error: z.string() });

// ---------------------------------------------------------------------------
// Correction rounds: a fixed vocabulary of changes, applied to the current
// plan. Sentences are addressed by unit id, never by position, so several
// changes in one round cannot shift each other. Overlays are addressed by
// their index in the plan BEFORE the round; `atSegment` in an added or
// updated overlay refers to the plan AFTER the sentence changes.
// ---------------------------------------------------------------------------

const overlayIndex = z.number().int().min(0);

export const videoAiOpSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('remove_segment'), unitId: videoAiUnitIdSchema }),
  /** Back in, at its place in spoken order (after the hook). */
  z.object({ kind: z.literal('restore_unit'), unitId: videoAiUnitIdSchema }),
  /** `before: null` moves it to the end; moving to the front makes it the hook. */
  z.object({
    kind: z.literal('move_segment'),
    unitId: videoAiUnitIdSchema,
    before: videoAiUnitIdSchema.nullable(),
  }),
  /** Another take of the same statement in its place. */
  z.object({
    kind: z.literal('swap_take'),
    unitId: videoAiUnitIdSchema,
    withUnitId: videoAiUnitIdSchema,
  }),
  z.object({
    kind: z.literal('set_framing'),
    unitId: videoAiUnitIdSchema,
    framing: videoAiFramingSchema,
  }),
  z.object({ kind: z.literal('set_zoom'), unitId: videoAiUnitIdSchema, zoom: videoAiZoomSchema }),
  z.object({ kind: z.literal('add_overlay'), overlay: videoAiOverlaySchema }),
  z.object({
    kind: z.literal('update_overlay'),
    index: overlayIndex,
    overlay: videoAiOverlaySchema,
  }),
  z.object({ kind: z.literal('remove_overlay'), index: overlayIndex }),
  z.object({
    kind: z.literal('set_captions'),
    enabled: z.boolean(),
    template: videoAiCaptionTemplateSchema.nullish(),
  }),
  z.object({
    kind: z.literal('set_music'),
    music: z.object({ assetId: z.string().min(1), volume: z.enum(['leise', 'mittel']) }).nullable(),
  }),
  z.object({
    kind: z.literal('set_caption_text'),
    unitId: videoAiUnitIdSchema,
    start: z.number().min(0),
    text: z.string().trim().min(1).max(40),
  }),
]);
export type VideoAiOp = z.infer<typeof videoAiOpSchema>;

export const VIDEO_AI_MAX_VERSIONS = 30;

/** Direct changes from the preview (restore a sentence, fix a caption word); no model. */
export const applyVideoAiOpsBodySchema = z.object({
  baseVersion: z.number().int().min(1),
  ops: z.array(videoAiOpSchema).min(1).max(20),
  summary: z.string().trim().min(1).max(80).nullish(),
});
export type ApplyVideoAiOpsBody = z.infer<typeof applyVideoAiOpsBodySchema>;

/** A correction in the person's words; `times` are preview seconds they pointed at. */
export const reviseVideoAiBodySchema = z.object({
  baseVersion: z.number().int().min(1),
  feedback: z.string().trim().min(2).max(1000),
  times: z.array(z.number().min(0)).max(5).nullish(),
});
export type ReviseVideoAiBody = z.infer<typeof reviseVideoAiBodySchema>;

export const reviseVideoAiResponseSchema = z.object({
  project: videoAiProjectDtoSchema,
  /** One or two sentences to the person: what changed, or why nothing could. */
  reply: z.string(),
});

// ---------------------------------------------------------------------------
// The compiled plan for the editor: everything it needs to build its own
// timeline, in seconds.
// ---------------------------------------------------------------------------

export const videoAiTimelineSchema = z.object({
  projectId: z.string().guid(),
  version: z.number().int().min(1),
  locale: z.enum(['de-DE', 'de-AT']),
  edl: videoAiEdlSchema,
  duration: z.number(),
  pieces: z.array(
    z.object({
      segmentIndex: z.number().int(),
      unitId: videoAiUnitIdSchema,
      clipId: videoAiClipIdSchema,
      sourceStart: z.number(),
      sourceEnd: z.number(),
      outStart: z.number(),
      outEnd: z.number(),
    })
  ),
  /** Caption words in output time, corrections applied. */
  words: z.array(
    z.object({
      text: z.string(),
      outStart: z.number(),
      outEnd: z.number(),
      segmentIndex: z.number().int(),
    })
  ),
  clips: z.array(
    z.object({
      id: videoAiClipIdSchema,
      role: z.enum(['footage', 'broll']),
      /** The working copy; streams through /api/share/:token/stream. */
      shareToken: z.string(),
      duration: z.number(),
      width: z.number().int().nullable(),
      height: z.number().int().nullable(),
    })
  ),
  assets: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['image', 'logo', 'audio']),
      title: z.string(),
      /** Null once the item left the Mediathek. */
      shareToken: z.string().nullable(),
      durationSeconds: z.number().nullable(),
    })
  ),
  person: z.object({ name: z.string(), role: z.string() }).nullable(),
});
export type VideoAiTimeline = z.infer<typeof videoAiTimelineSchema>;

/** A finished resumable upload (TUS on /api/audio/upload) into the Mediathek. */
export const importVideoAiUploadBodySchema = z.object({
  uploadId: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
  title: z.string().trim().max(200).nullish(),
});
export type ImportVideoAiUploadBody = z.infer<typeof importVideoAiUploadBodySchema>;

export const importVideoAiUploadResponseSchema = z.object({
  mediaId: z.string().guid(),
  mediaType: z.enum(['video', 'audio']),
  title: z.string(),
  durationSeconds: z.number(),
});
