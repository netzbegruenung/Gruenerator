import { z } from 'zod';

/**
 * Free-text sharepic creator (experimental).
 *
 * The model never writes pixels or hex colours. It writes a `SharepicSpec` out
 * of building blocks; the canvas editor's composer turns the spec into an
 * editable `freeform` canvas with the brand's own layout rules, and the vision
 * review answers with patch operations against the same spec.
 */

export const sharepicCreatorLocaleSchema = z.enum(['de-DE', 'de-AT']);
export type SharepicCreatorLocale = z.infer<typeof sharepicCreatorLocaleSchema>;

/**
 * Brand colours by name. The palette follows what the parties actually post
 * (analysis of the 20 newest Instagram posts each, 10/2026), not the older
 * template set: DE posts use Dunkeltanne, Grasgrün and Mint — Klee and Sand
 * hardly appear any more.
 */
export const sharepicColorSchema = z.enum([
  'tanne',
  'dunkeltanne',
  'grasgruen',
  'mint',
  'dunkelgruen',
  'hellgruen',
  'weiss',
]);
export type SharepicColor = z.infer<typeof sharepicColorSchema>;

export const SHAREPIC_LOCALE_COLORS: Record<SharepicCreatorLocale, readonly SharepicColor[]> = {
  'de-DE': ['tanne', 'dunkeltanne', 'grasgruen', 'mint', 'weiss'],
  'de-AT': ['dunkelgruen', 'hellgruen', 'weiss'],
};

export const sharepicPositionSchema = z.enum(['oben', 'mitte', 'unten']);
export type SharepicPosition = z.infer<typeof sharepicPositionSchema>;
export const sharepicAlignSchema = z.enum(['links', 'zentriert']);
export type SharepicAlign = z.infer<typeof sharepicAlignSchema>;
export const sharepicTextSideSchema = z.enum(['unten', 'oben', 'links', 'rechts']);
export type SharepicTextSide = z.infer<typeof sharepicTextSideSchema>;

/** Hard copy limits — longer text breaks the layout, not just the style. */
export const SHAREPIC_LIMITS = {
  headlineLine: 24,
  headlineLines: 5,
  dachzeile: 40,
  text: 220,
  zitat: 220,
  listItem: 70,
  button: 32,
  stoerer: 28,
  ortLine: 45,
} as const;

const line = (max: number) => z.string().trim().min(1).max(max);

/** One text group, read top to bottom. Every slide has exactly one. */
export const sharepicItemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('dachzeile'), text: line(SHAREPIC_LIMITS.dachzeile) }),
  z.object({
    type: z.literal('headline'),
    /** Explicit line breaks — the composer never re-wraps a headline. */
    lines: z.array(line(SHAREPIC_LIMITS.headlineLine)).min(1).max(SHAREPIC_LIMITS.headlineLines),
    /** Index of the one emphasised line, if any. */
    akzent: z.number().int().min(0).optional(),
  }),
  z.object({ type: z.literal('text'), text: line(SHAREPIC_LIMITS.text) }),
  z.object({
    type: z.literal('zitat'),
    text: line(SHAREPIC_LIMITS.zitat),
    name: line(60),
    funktion: line(80).optional(),
  }),
  z.object({
    type: z.literal('liste'),
    items: z.array(line(SHAREPIC_LIMITS.listItem)).min(2).max(5),
  }),
  z.object({ type: z.literal('button'), text: line(SHAREPIC_LIMITS.button) }),
]);
export type SharepicItem = z.infer<typeof sharepicItemSchema>;
export type SharepicItemType = SharepicItem['type'];

export const sharepicBackgroundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('farbe'), color: sharepicColorSchema }),
  z.object({
    kind: z.literal('foto'),
    filename: z.string().regex(/^[\w.-]+\.jpe?g$/i, 'filename aus fotos_suchen übernehmen'),
    /** Where the text sits on the photo; that side gets a darkening gradient. */
    textSeite: sharepicTextSideSchema,
  }),
  z.object({
    kind: z.literal('foto-oben'),
    filename: z.string().regex(/^[\w.-]+\.jpe?g$/i, 'filename aus fotos_suchen übernehmen'),
    panelColor: sharepicColorSchema,
  }),
]);
export type SharepicBackground = z.infer<typeof sharepicBackgroundSchema>;

export const sharepicSpecSchema = z
  .object({
    locale: sharepicCreatorLocaleSchema,
    background: sharepicBackgroundSchema,
    position: sharepicPositionSchema,
    align: sharepicAlignSchema,
    items: z.array(sharepicItemSchema).min(1).max(5),
    stoerer: z.object({ text: line(SHAREPIC_LIMITS.stoerer) }).optional(),
    datum: z.object({ weekday: line(12), date: line(12), time: line(12) }).optional(),
    ort: z.object({ lines: z.array(line(SHAREPIC_LIMITS.ortLine)).min(1).max(2) }).optional(),
    logo: z.boolean(),
    /** "Swipe on" arrow, for carousel-style slides. */
    pfeil: z.boolean(),
  })
  .superRefine((spec, ctx) => {
    const allowed = SHAREPIC_LOCALE_COLORS[spec.locale];
    const bg = spec.background;
    const color = bg.kind === 'farbe' ? bg.color : bg.kind === 'foto-oben' ? bg.panelColor : null;
    if (color && !allowed.includes(color)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['background'],
        message: `Farbe "${color}" gibt es für ${spec.locale} nicht. Erlaubt: ${allowed.join(', ')}.`,
      });
    }
    const headlines = spec.items.filter((i) => i.type === 'headline');
    if (headlines.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: 'Nur eine headline pro Sharepic.',
      });
    }
    for (const h of headlines) {
      if (h.type === 'headline' && h.akzent !== undefined && h.akzent >= h.lines.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items'],
          message: `akzent ${h.akzent} zeigt auf keine Zeile.`,
        });
      }
    }
    if (spec.items.filter((i) => i.type === 'button').length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: 'Höchstens ein button.',
      });
    }
  });
export type SharepicSpec = z.infer<typeof sharepicSpecSchema>;

/**
 * What the vision review may change. Items are addressed by their index in
 * `spec.items` — the review sees the spec with indices, nothing else.
 */
export const sharepicPatchOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('set_text'),
    item: z.number().int().min(0),
    text: z.string().trim().min(1),
  }),
  z.object({
    op: z.literal('set_headline'),
    lines: z.array(z.string().trim().min(1)).min(1),
    akzent: z.number().int().min(0).optional(),
  }),
  z.object({ op: z.literal('remove_item'), item: z.number().int().min(0) }),
  z.object({ op: z.literal('set_position'), position: sharepicPositionSchema }),
  z.object({ op: z.literal('set_align'), align: sharepicAlignSchema }),
  z.object({ op: z.literal('set_text_side'), textSeite: sharepicTextSideSchema }),
  z.object({ op: z.literal('set_color'), color: sharepicColorSchema }),
  /** Drop a photo that does not fit and use a brand colour instead. */
  z.object({ op: z.literal('use_color'), color: sharepicColorSchema }),
  z.object({
    op: z.literal('remove_extra'),
    extra: z.enum(['stoerer', 'datum', 'ort', 'logo', 'pfeil']),
  }),
]);
export type SharepicPatchOp = z.infer<typeof sharepicPatchOpSchema>;

export const sharepicPhotoAttributionSchema = z.object({
  photographer: z.string(),
  profileUrl: z.string(),
  photoUrl: z.string(),
});
export type SharepicPhotoAttribution = z.infer<typeof sharepicPhotoAttributionSchema>;

export const sharepicDraftBodySchema = z.object({
  prompt: z.string().trim().min(3).max(1500),
  locale: sharepicCreatorLocaleSchema.optional(),
  /** The draft to change; `prompt` is then the change request. */
  current: sharepicSpecSchema.optional(),
});

export const sharepicDraftResponseSchema = z.object({
  spec: sharepicSpecSchema,
  /** Chapters the model asked for — shown in the UI so the knowledge path stays visible. */
  chapters: z.array(z.string()),
  attribution: sharepicPhotoAttributionSchema.nullable(),
});
export type SharepicDraftResponse = z.infer<typeof sharepicDraftResponseSchema>;

export const sharepicReviewBodySchema = z.object({
  spec: sharepicSpecSchema,
  prompt: z.string().trim().min(1).max(1500),
  /** PNG/JPEG data URL of the rendered draft. */
  image: z.string().startsWith('data:image/').max(8_000_000),
});

export const sharepicReviewResponseSchema = z.object({
  ok: z.boolean(),
  issues: z.array(z.string()),
  patch: z.array(sharepicPatchOpSchema),
});
export type SharepicReviewResponse = z.infer<typeof sharepicReviewResponseSchema>;

export const sharepicCreatorErrorSchema = z.object({ error: z.string() });
