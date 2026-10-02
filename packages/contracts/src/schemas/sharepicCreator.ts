import { z } from 'zod';

import { markerCanOpenAt, parseInlineMarks } from '../text/inlineMarks.js';

/**
 * Free-text sharepic creator (experimental).
 *
 * The model never writes pixels or hex colours. It writes a `SharepicSpec` out
 * of building blocks — one slide, or a carousel of several — and the canvas
 * editor's composer turns each slide into an editable `freeform` page with the
 * brand's own layout rules. The vision review answers with patch operations
 * against the same spec.
 *
 * Texts may carry `==accent==` on single words (the editor's accent mark) and
 * `**bold**`. DE quotes, paragraphs and headlines may also carry up to two
 * `++marker++` passages (the marker box); AT sets those as `==accent==`.
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

/** One `++marker++` passage per pair; a slide may carry at most this many (DE only). */
export const SHAREPIC_MARKER_PASSAGES = 2;

/** `C++` is text, not a marker: the one word-bound rule the inline parser uses too. */
const isOpener = (text: string, at: number, mark: '==' | '++') =>
  mark === '==' || markerCanOpenAt(text, at);

/** Tightens whitespace just inside every matched `<mark>…<mark>` pair of one delimiter. */
function tightenPairs(text: string, mark: '==' | '++'): string {
  let out = '';
  let pos = 0;
  let from = 0;
  for (;;) {
    const open = text.indexOf(mark, from);
    if (open !== -1 && !isOpener(text, open, mark)) {
      from = open + 2;
      continue;
    }
    const close = open === -1 ? -1 : text.indexOf(mark, open + 2);
    if (close === -1) return out + text.slice(pos);
    const inner = text.slice(open + 2, close).trim();
    out += inner ? `${text.slice(pos, open)}${mark}${inner}${mark}` : text.slice(pos, close + 2);
    pos = close + 2;
    from = pos;
  }
}

/**
 * Tightens whitespace just inside a matched `==…==` or `++…++` pair: `== x ==`,
 * `==x ==` and `== x==` become `==x==`. The inline tokenizer only closes a mark
 * behind a non-space, so a model's `==Mach mit! ==` would otherwise render
 * literally. Linear scan, no regex; an unpaired mark stays and is rejected by
 * the draft validation.
 */
export function tightenAccentMarks(text: string): string {
  return tightenPairs(tightenPairs(text, '=='), '++');
}

/**
 * True when a `==` or `++` is left without its partner, or the marks cross
 * (`++a ==b++ c==`) — nothing can repair that by whitespace. Judged by the
 * inline parser itself: whatever it leaves as literal mark characters is
 * stray, except a `++` glued to a word (`C++`), which is text.
 */
export function hasUnpairedAccentMark(text: string): boolean {
  return text.split('\n').some((line) => {
    const shown = parseInlineMarks(line)
      .map((run) => run.text)
      .join('');
    return shown.includes('==') || strayPlusPlus(shown);
  });
}

function strayPlusPlus(text: string): boolean {
  for (let at = text.indexOf('++'); at !== -1; at = text.indexOf('++', at + 2)) {
    if (markerCanOpenAt(text, at)) return true;
  }
  return false;
}

/** How many `++marker++` passages a text carries: stretches of marked runs, per line. */
export function countMarkerPassages(text: string): number {
  let passages = 0;
  for (const line of text.split('\n')) {
    let inside = false;
    for (const run of parseInlineMarks(line)) {
      if (run.marker && !inside) passages += 1;
      inside = run.marker;
    }
  }
  return passages;
}

/**
 * Applies `tightenAccentMarks` to every string of a spec or patch op, whatever
 * its field — ids, filenames and colours never contain `==`, so a blanket walk
 * cannot touch them and cannot miss a text field added later.
 */
export function tightenAccentMarksDeep<T>(value: T): T {
  if (typeof value === 'string') return tightenAccentMarks(value) as T;
  if (Array.isArray(value)) return value.map(tightenAccentMarksDeep) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, tightenAccentMarksDeep(v)])
    ) as T;
  }
  return value;
}

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
  absatz: 240,
  quelle: 90,
  zitatQuelle: 80,
  frage: 160,
  frageVon: 20,
  slides: 8,
} as const;

const line = (max: number) => z.string().trim().min(1).max(max);

const sharepicAccentSchema = z.union([
  z.number().int().min(0),
  z.array(z.number().int().min(0)).min(1).max(4),
]);
/** The accent line indices, whatever form the spec gives them in. */
export function accentLines(akzent: number | number[] | undefined): number[] {
  return akzent === undefined ? [] : Array.isArray(akzent) ? akzent : [akzent];
}

/** One text group, read top to bottom. Every slide has exactly one. */
export const sharepicItemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('dachzeile'), text: line(SHAREPIC_LIMITS.dachzeile) }),
  z.object({
    type: z.literal('headline'),
    /** Explicit line breaks — the composer never re-wraps a headline. */
    lines: z.array(line(SHAREPIC_LIMITS.headlineLine)).min(1).max(SHAREPIC_LIMITS.headlineLines),
    /** Emphasised line(s): one index, or a few consecutive ones for a closing line. */
    akzent: sharepicAccentSchema.optional(),
  }),
  z.object({ type: z.literal('text'), text: line(SHAREPIC_LIMITS.text) }),
  /**
   * A paragraph of a carousel slide, set larger than `text`. Several in a row
   * tell a story; `betont` sets one apart (DE: green line boxes, AT: yellow).
   */
  z.object({
    type: z.literal('absatz'),
    text: line(SHAREPIC_LIMITS.absatz),
    betont: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('zitat'),
    text: line(SHAREPIC_LIMITS.zitat),
    name: line(60),
    funktion: line(80).optional(),
    /** Medium credit, set after the name: "im FAZ-Interview". */
    quelle: line(SHAREPIC_LIMITS.zitatQuelle).optional(),
  }),
  /** An interview question; the answer follows as the next `absatz`. */
  z.object({
    type: z.literal('frage'),
    text: line(SHAREPIC_LIMITS.frage),
    /** The medium's short name, set before the question: "SZ: …". */
    von: line(SHAREPIC_LIMITS.frageVon).optional(),
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
  /** Text on the brand colour above, the photo below fading into it. */
  z.object({
    kind: z.literal('foto-unten'),
    filename: z.string().regex(/^[\w.-]+\.jpe?g$/i, 'filename aus fotos_suchen übernehmen'),
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
  datum: z.object({ weekday: line(12), date: line(12), time: line(12) }).optional(),
  ort: z.object({ lines: z.array(line(SHAREPIC_LIMITS.ortLine)).min(1).max(2) }).optional(),
  logo: z.boolean(),
  /** DE only: every line in its own box — the story slides on photos. */
  zeilenboxen: z.boolean().optional(),
  /** Where a number on the slide comes from, small at the bottom. */
  quelle: line(SHAREPIC_LIMITS.quelle).optional(),
});
export type SharepicSlide = z.infer<typeof sharepicSlideSchema>;

/**
 * A sharepic is one slide; a carousel is several, swiped in order. The
 * "swipe on" arrow is not part of the spec — every slide but the last gets
 * one.
 */
export const sharepicSpecSchema = z
  .object({
    locale: sharepicCreatorLocaleSchema,
    slides: z.array(sharepicSlideSchema).min(1).max(SHAREPIC_LIMITS.slides),
  })
  .superRefine((spec, ctx) => {
    const allowed = SHAREPIC_LOCALE_COLORS[spec.locale];
    spec.slides.forEach((slide, s) => {
      const at = (...path: (string | number)[]) => ['slides', s, ...path];
      const bg = slide.background;
      const color = bg.kind === 'farbe' ? bg.color : bg.kind === 'foto' ? null : bg.panelColor;
      if (color && !allowed.includes(color)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('background'),
          message: `Farbe "${color}" gibt es für ${spec.locale} nicht. Erlaubt: ${allowed.join(', ')}.`,
        });
      }
      const headlines = slide.items.filter((i) => i.type === 'headline');
      if (headlines.length > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('items'),
          message: 'Nur eine headline pro Slide.',
        });
      }
      for (const h of headlines) {
        const outside =
          h.type === 'headline' ? accentLines(h.akzent).filter((i) => i >= h.lines.length) : [];
        if (outside.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: at('items'),
            message: `akzent ${outside.join(', ')} zeigt auf keine Zeile.`,
          });
        }
      }
      if (slide.items.filter((i) => i.type === 'button').length > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('items'),
          message: 'Höchstens ein button pro Slide.',
        });
      }
      if (slide.zeilenboxen && spec.locale !== 'de-DE') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('zeilenboxen'),
          message: 'zeilenboxen gibt es nur im deutschen Corporate Design.',
        });
      }
    });
  });
export type SharepicSpec = z.infer<typeof sharepicSpecSchema>;

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
  /** Photo credit per slide, `null` on a colour slide. */
  attributions: z.array(sharepicPhotoAttributionSchema.nullable()),
});
export type SharepicDraftResponse = z.infer<typeof sharepicDraftResponseSchema>;

export const sharepicReviewBodySchema = z.object({
  spec: sharepicSpecSchema,
  prompt: z.string().trim().min(1).max(1500),
  /** PNG/JPEG data URL of the rendered draft — a carousel as one contact sheet. */
  image: z.string().startsWith('data:image/').max(8_000_000),
});

export const sharepicReviewResponseSchema = z.object({
  ok: z.boolean(),
  issues: z.array(z.string()),
  patch: z.array(sharepicPatchOpSchema),
});
export type SharepicReviewResponse = z.infer<typeof sharepicReviewResponseSchema>;

export const sharepicCreatorErrorSchema = z.object({ error: z.string() });
