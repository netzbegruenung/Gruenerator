import { z } from 'zod';

/**
 * Presentations (reveal.js decks, collaborative_documents subtype
 * 'presentations'). A deck is an ordered list of slides; each slide has a
 * layout, a title, a markdown body, and speaker notes. Slides live directly in
 * a shared Y.Doc (see presentationsYdoc.ts) — reveal.js is only a renderer, so
 * there is no mutation-log bridge like sheets.
 *
 * The chat cannot edit the deck itself — POST /api/presentations/:id/ai turns a
 * natural-language request into a list of presentation operations, which the
 * editor applies client-side in one Yjs transaction. Mirrors the sheets
 * plan-then-apply pattern (schemas/sheets.ts).
 */

export const slideLayoutSchema = z.enum(['title', 'content', 'split', 'quote', 'image', 'code']);

export type SlideLayout = z.infer<typeof slideLayoutSchema>;

/** reveal.js transition names (per-slide or deck default). */
export const slideTransitionSchema = z.enum(['none', 'fade', 'slide', 'convex', 'concave', 'zoom']);

export type SlideTransition = z.infer<typeof slideTransitionSchema>;

/**
 * One slide. `body` is markdown (or source code for the `code` layout).
 * `background` is a CSS color, an image/video URL, or a `linear-gradient(...)`
 * string — the renderer picks the matching reveal `data-background-*`.
 * `fragments` reveals the body's list items step by step; `autoAnimate` morphs
 * matching elements from the previous slide; `hidden` skips the slide in
 * present mode without deleting it.
 */
export const slideSchema = z.object({
  id: z.string(),
  layout: slideLayoutSchema,
  title: z.string(),
  body: z.string(),
  notes: z.string(),
  background: z.string().nullish(),
  transition: slideTransitionSchema.nullish(),
  fragments: z.boolean().nullish(),
  autoAnimate: z.boolean().nullish(),
  hidden: z.boolean().nullish(),
  /** Language for the `code` layout (e.g. "typescript", "python"). */
  codeLanguage: z.string().nullish(),
});

export type Slide = z.infer<typeof slideSchema>;

/**
 * AI operations. Slides are addressed by 1-based position (`slide`) — the same
 * numbering the serialized context shows the model, which is far more reliable
 * than UUIDs. Patch semantics on update_slide: only present fields change.
 */
export const presentationOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('add_slide'),
    layout: slideLayoutSchema,
    title: z.string(),
    /** Markdown body. Use '- ' bullet lists for content slides. */
    body: z.string(),
    notes: z.string().nullish(),
    /** 1-based insert position; appended to the end when omitted. */
    at: z.number().int().positive().nullish(),
  }),
  z.object({
    type: z.literal('update_slide'),
    /** 1-based slide number. */
    slide: z.number().int().positive(),
    title: z.string().nullish(),
    body: z.string().nullish(),
    notes: z.string().nullish(),
    layout: slideLayoutSchema.nullish(),
    /** CSS color, image/video URL, or `linear-gradient(...)`. */
    background: z.string().nullish(),
    transition: slideTransitionSchema.nullish(),
    fragments: z.boolean().nullish(),
    autoAnimate: z.boolean().nullish(),
    hidden: z.boolean().nullish(),
    codeLanguage: z.string().nullish(),
  }),
  z.object({
    type: z.literal('delete_slide'),
    slide: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('move_slide'),
    /** 1-based source position. */
    from: z.number().int().positive(),
    /** 1-based target position. */
    to: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('set_deck_option'),
    defaultTransition: slideTransitionSchema.nullish(),
    /** Advance automatically after N ms (kiosk mode); 0/null disables. */
    autoSlide: z.number().int().nonnegative().nullish(),
    loop: z.boolean().nullish(),
    /** Show reveal slide numbers. */
    slideNumber: z.boolean().nullish(),
  }),
]);

export type PresentationOperation = z.infer<typeof presentationOperationSchema>;

export const presentationOperationsSchema = z.array(presentationOperationSchema).max(40);

/**
 * Request body for POST /api/presentations/:id/ai. `presentationContext` is the
 * serialized (markdown outline) state of the deck the frontend produced — the
 * server never reads the Y.Doc for live edits (frontend is the canonical
 * editor).
 */
export const presentationAiRequestBodySchema = z.object({
  userPrompt: z.string(),
  presentationContext: z.string(),
  referenceContent: z.string().nullish(),
});

export type PresentationAiRequestBody = z.infer<typeof presentationAiRequestBodySchema>;

export const presentationAiResponseSchema = z.object({
  operations: z.array(presentationOperationSchema),
});

export type PresentationAiResponse = z.infer<typeof presentationAiResponseSchema>;

export const presentationErrorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});
