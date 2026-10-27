// SPDX-License-Identifier: MPL-2.0

/**
 * The neutral canvas-AI operation vocabulary: what a model may ask a canvas
 * template to change. A host composes its own operations on top with
 * `createCanvasAiOperationSchema`, which keeps the option order it is given;
 * that order is the `anyOf` order of the JSON schema a model sees.
 *
 * Design notes:
 *   - All optional fields use `.nullish()`: models send `null` as often as
 *     they omit a field.
 *   - The discriminator key is `kind`. Kind strings are persisted and sent by
 *     shipped clients; never rename one.
 */
import { z } from 'zod';

export const HexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .describe('CSS hex color in `#rrggbb` format.');

export const setTextOperation = z.object({
  kind: z.literal('set-text'),
  /**
   * Field identifier scoped to the active template (e.g. `headline`,
   * `subtext`, `quote`, `line1`, `title`). For freeform: an existing
   * additionalText id, or `new-body` to add a fresh body text.
   */
  field: z.string().min(1),
  /** Human-readable label for UI preview (e.g. "Headline"). */
  label: z.string().min(1),
  value: z.string(),
});

export const setColorSchemeOperation = z.object({
  kind: z.literal('set-color-scheme'),
  /** Opaque color scheme id from the template's capabilities (`colorSchemes`). */
  schemeId: z.string().min(1),
});

export const setBackgroundColorOperation = z.object({
  kind: z.literal('set-background-color'),
  color: HexColor,
});

export const setColorModeOperation = z.object({
  kind: z.literal('set-color-mode'),
  mode: z.enum(['light', 'dark']),
});

export const addIllustrationOperation = z.object({
  kind: z.literal('add-illustration'),
  /** Illustration id from the template's capabilities (`illustrations`). */
  illustrationId: z.string().min(1),
  color: HexColor.nullish(),
});

export const addAssetOperation = z.object({
  kind: z.literal('add-asset'),
  /** Asset id from the template's capabilities (`assets`). */
  assetId: z.string().min(1),
});

export const removeElementOperation = z.object({
  kind: z.literal('remove-element'),
  /** Existing element instance id. */
  elementId: z.string().min(1),
});

export const setFontSizeOperation = z.object({
  kind: z.literal('set-font-size'),
  /**
   * Field identifier scoped to the active template (`headline`, `subtext`,
   * `quote`, `line1`, `title`, …). Templates with primary/secondary text
   * fields accept the canonical `primary` / `secondary` aliases too.
   */
  field: z.string().min(1),
  /** Human-readable label for UI preview (e.g. "Headline"). */
  label: z.string().min(1),
  /** Pixel size. Templates clamp to their min/max; values outside are coerced. */
  size: z.number().int().positive().max(500),
});

/**
 * Patch shape for `update-element`. Exported separately so an applier can use
 * it as the canonical update-action parameter type.
 *
 * All fields independently optional; the operation below enforces "at least
 * one field" at parse time.
 */
export const canvasAiUpdatePatchSchema = z.object({
  color: HexColor.nullish(),
  opacity: z.number().min(0).max(1).nullish(),
  scale: z.number().positive().max(10).nullish(),
  rotation: z.number().min(-360).max(360).nullish(),
  x: z.number().nullish(),
  y: z.number().nullish(),
});

export type CanvasAiUpdatePatch = z.infer<typeof canvasAiUpdatePatchSchema>;

/**
 * Mutate an existing on-canvas element by id. The model only sees elements
 * listed in the snapshot's `elementsSummary`, so it can only target ids the
 * snapshot exposed. The applier looks up the element's kind from current
 * state and forwards the patch to the matching update action.
 */
export const updateElementOperation = z.object({
  kind: z.literal('update-element'),
  elementId: z.string().min(1),
  patch: canvasAiUpdatePatchSchema.refine(
    (p) =>
      p.color != null ||
      p.opacity != null ||
      p.scale != null ||
      p.rotation != null ||
      p.x != null ||
      p.y != null,
    { message: 'patch must include at least one field' }
  ),
});

/**
 * Swap the stock background photo. The model provides a search query; a
 * server resolves it to a concrete stock image before the operation reaches
 * any state patch. A client-side applier cannot resolve queries and rejects
 * this kind.
 */
export const setBackgroundImageOperation = z.object({
  kind: z.literal('set-background-image'),
  /** Stock-photo search query in the content language. */
  query: z.string().min(2).max(120),
});

/** One option of an operation union: an object discriminated by a literal `kind`. */
export type CanvasAiOperationOption = z.ZodObject<{ kind: z.ZodLiteral<string> } & z.ZodRawShape>;

/**
 * The operation union over `options`, in exactly the given order. A host
 * passes the core options plus its own, placed where they belong.
 */
export function createCanvasAiOperationSchema<
  const T extends readonly [CanvasAiOperationOption, ...CanvasAiOperationOption[]],
>(options: T) {
  return z.discriminatedUnion('kind', options);
}

/** The core options in their canonical order. */
export const CORE_CANVAS_AI_OPERATION_OPTIONS = [
  setTextOperation,
  setColorSchemeOperation,
  setBackgroundColorOperation,
  setColorModeOperation,
  addIllustrationOperation,
  addAssetOperation,
  removeElementOperation,
  setFontSizeOperation,
  updateElementOperation,
  setBackgroundImageOperation,
] as const;

export const coreCanvasAiOperationSchema = createCanvasAiOperationSchema(
  CORE_CANVAS_AI_OPERATION_OPTIONS
);

export type CoreCanvasAiOperation = z.infer<typeof coreCanvasAiOperationSchema>;
export type CoreCanvasAiOperationKind = CoreCanvasAiOperation['kind'];

export const CORE_CANVAS_AI_OPERATION_KINDS: readonly CoreCanvasAiOperationKind[] =
  CORE_CANVAS_AI_OPERATION_OPTIONS.map((option) => option.shape.kind.value);

export function isCoreCanvasAiOperation(op: { kind: string }): op is CoreCanvasAiOperation {
  return (CORE_CANVAS_AI_OPERATION_KINDS as readonly string[]).includes(op.kind);
}
