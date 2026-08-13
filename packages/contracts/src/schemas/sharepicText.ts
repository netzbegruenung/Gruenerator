/**
 * Zod schemas for the sharepic TEXT generation endpoints.
 *
 * Covers POST /api/sharepic/text/{dreizeilen,zitat,zitat_pure,info,
 * veranstaltung,simple,slider} — served by
 * apps/api/routes/sharepic/sharepic_text/unifiedHandler.ts.
 *
 * `text/default` is deliberately NOT contracted: it answers with a different
 * shape (`{sharepics, metadata}`) from a different handler.
 *
 * IMPORTANT: Request bodies use `.nullish()` for optional fields per the
 * 2026-04-12 production incident rule.
 *
 * THE RESPONSE SHAPES ARE FROZEN (F0). Each type puts its payload under its
 * own top-level key — `mainSlogan`, `mainInfo`, `mainEvent`, `mainSimple`,
 * `mainSlider` — and the quote types put a bare STRING under `quote`. That is
 * what shipped mobile binaries read; these schemas describe the wire, they do
 * not propose a better one.
 */
import { z } from 'zod';

// ── Request bodies ──────────────────────────────────────────────────────────

/**
 * Shared body for all seven text types.
 *
 * DELIBERATELY ABSENT, both load-bearing:
 *
 * - `userLocale`. The handler branches on it (`<type>_at` prompts) and the AT
 *   variants answer with DIFFERENT FIELDS — `info_at` returns
 *   introline/text/accent where `info` returns header/subheader/body. Over
 *   HTTP nobody sets it today: the locale travels as the `X-User-Locale`
 *   header, and only the in-process chat path passes `userLocale` in the body.
 *   Leaving it out of the schema means Zod strips it, so the 200 shape stays
 *   structurally fixed. If AT texts are ever wanted over HTTP, give them their
 *   own route — not this one with two shapes.
 * - `_campaignPrompt`. An in-process channel for campaign configs. Accepting
 *   it over HTTP would let a caller replace the system prompt.
 */
export const sharepicTextBodySchema = z.object({
  thema: z.string().nullish(),
  details: z.string().nullish(),
  quote: z.string().nullish(),
  name: z.string().nullish(),
  /**
   * Number of variants. Clamped in the router rather than rejected — web sends
   * 1, mobile sends a fixed 5, and a previously accepted value must not turn
   * into a 400.
   */
  count: z.number().int().nullish(),
  partyName: z.string().nullish(),
  source: z.string().nullish(),
  preserveName: z.boolean().nullish(),
});

/** Slider additionally lets the model pick the slide count first. */
export const sharepicSliderTextBodySchema = sharepicTextBodySchema.extend({
  smartCount: z.boolean().nullish(),
});

// ── Errors ──────────────────────────────────────────────────────────────────

/**
 * 400 also carries the model's refusal, prefixed with `Ablehnung: `
 * (REFUSAL_ERROR_PREFIX) — a declined request, not a malformed one.
 */
export const sharepicTextErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

// ── Payload building blocks ─────────────────────────────────────────────────

export const sharepicSloganSchema = z.object({
  line1: z.string(),
  line2: z.string(),
  line3: z.string(),
  /** Only the AT sujet (`dreizeilen_at`) fills this; unreachable over HTTP. */
  subline: z.string().optional(),
});

export const sharepicInfoSchema = z.object({
  header: z.string(),
  subheader: z.string(),
  body: z.string(),
});

export const sharepicEventSchema = z.object({
  eventTitle: z.string(),
  weekday: z.string(),
  date: z.string(),
  time: z.string(),
  locationName: z.string(),
  address: z.string(),
  beschreibung: z.string(),
});

export const sharepicSimpleSchema = z.object({
  headline: z.string(),
  subtext: z.string(),
});

export const sharepicSliderSchema = z.object({
  label: z.string(),
  headline: z.string(),
  subtext: z.string(),
  subtext2: z.string(),
});

// ── Responses ───────────────────────────────────────────────────────────────

const successBase = {
  success: z.literal(true),
  searchTerms: z.array(z.string()),
};

export const dreizeilenTextResponseSchema = z.object({
  ...successBase,
  mainSlogan: sharepicSloganSchema,
  alternatives: z.array(sharepicSloganSchema),
});

export const infoTextResponseSchema = z.object({
  ...successBase,
  mainInfo: sharepicInfoSchema,
  alternatives: z.array(sharepicInfoSchema),
});

export const veranstaltungTextResponseSchema = z.object({
  ...successBase,
  mainEvent: sharepicEventSchema,
  alternatives: z.array(sharepicEventSchema),
});

export const simpleTextResponseSchema = z.object({
  ...successBase,
  mainSimple: sharepicSimpleSchema,
  alternatives: z.array(sharepicSimpleSchema),
});

export const sliderTextResponseSchema = z.object({
  ...successBase,
  mainSlider: sharepicSliderSchema,
  alternatives: z.array(sharepicSliderSchema),
});

/**
 * zitat / zitat_pure. `quote` is a bare STRING and `alternatives` is
 * `string[]` — `mapToResponseFormat` returns `data.zitat`, not an object.
 * Consumers that typed these as `{quote: string}[]` produced lists of empty
 * quotes; the schema is the wire, the interfaces were wrong.
 */
export const zitatTextResponseSchema = z.object({
  ...successBase,
  quote: z.string(),
  name: z.string(),
  alternatives: z.array(z.string()),
});

// ── Inferred types ──────────────────────────────────────────────────────────

export type SharepicTextBody = z.infer<typeof sharepicTextBodySchema>;
export type SharepicSliderTextBody = z.infer<typeof sharepicSliderTextBodySchema>;
export type SharepicSlogan = z.infer<typeof sharepicSloganSchema>;
export type SharepicInfo = z.infer<typeof sharepicInfoSchema>;
export type SharepicEvent = z.infer<typeof sharepicEventSchema>;
export type SharepicSimple = z.infer<typeof sharepicSimpleSchema>;
export type SharepicSlider = z.infer<typeof sharepicSliderSchema>;
export type DreizeilenTextResponse = z.infer<typeof dreizeilenTextResponseSchema>;
export type InfoTextResponse = z.infer<typeof infoTextResponseSchema>;
export type VeranstaltungTextResponse = z.infer<typeof veranstaltungTextResponseSchema>;
export type SimpleTextResponse = z.infer<typeof simpleTextResponseSchema>;
export type SliderTextResponse = z.infer<typeof sliderTextResponseSchema>;
export type ZitatTextResponse = z.infer<typeof zitatTextResponseSchema>;
