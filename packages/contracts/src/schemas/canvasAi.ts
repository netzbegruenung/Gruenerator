/**
 * Zod schemas for canvas AI suggestions.
 *
 * Source of truth for:
 *   - TypeScript types in @gruenerator/canvas-editor (operation discriminator)
 *   - Backend Zod validation of LLM tool-call arguments
 *   - JSON-schema fed to the LLM via tool calling (`toolInputJsonSchema` in apps/api)
 *
 * The neutral operation vocabulary and the wrappers that carry it live in
 * `@ggraphic/schema` (ai/operations.ts, ai/wrappers.ts). This file composes
 * the Grünerator's brand operation (`toggle-sunflower`) and element kind
 * (`balken`) on top, at the positions they always had: the option order is
 * the `anyOf` order of the tool schema the model sees, pinned by
 * apps/api/routes/canvas/services/canvasAiSchemas.golden.vitest.ts.
 *
 * Design notes:
 *   - All fields use `.nullish()` per the 2026-04-12 production-incident rule
 *     for any optional field traversed at runtime.
 *   - The discriminator key is `kind`; kind strings are F0.
 */
import {
  addAssetOperation,
  addIllustrationOperation,
  CORE_CANVAS_AI_ELEMENT_KINDS,
  createCanvasAiOperationSchema,
  createCanvasAiSchemas,
  createCanvasAiSnapshotSchema,
  removeElementOperation,
  setBackgroundColorOperation,
  setBackgroundImageOperation,
  setColorModeOperation,
  setColorSchemeOperation,
  setFontSizeOperation,
  setTextOperation,
  updateElementOperation,
} from '@ggraphic/schema';
import { z } from 'zod';

export {
  addAssetOperation,
  addIllustrationOperation,
  canvasAiCapabilitiesSchema,
  canvasAiUpdatePatchSchema,
  removeElementOperation,
  setBackgroundColorOperation,
  setBackgroundImageOperation,
  setColorModeOperation,
  setColorSchemeOperation,
  setFontSizeOperation,
  setTextOperation,
  updateElementOperation,
  type CanvasAiCapabilities,
  type CanvasAiUpdatePatch,
} from '@ggraphic/schema';

// ── Operations ──────────────────────────────────────────────────────────────

export const toggleSunflowerOperation = z.object({
  kind: z.literal('toggle-sunflower'),
  visible: z.boolean(),
});

export const canvasAiOperationSchema = createCanvasAiOperationSchema([
  setTextOperation,
  setColorSchemeOperation,
  setBackgroundColorOperation,
  setColorModeOperation,
  addIllustrationOperation,
  addAssetOperation,
  removeElementOperation,
  toggleSunflowerOperation,
  setFontSizeOperation,
  updateElementOperation,
  setBackgroundImageOperation,
]);

export type CanvasAiOperation = z.infer<typeof canvasAiOperationSchema>;
export type CanvasAiOperationKind = CanvasAiOperation['kind'];

const wrappers = createCanvasAiSchemas(canvasAiOperationSchema);

// ── Suggestions ─────────────────────────────────────────────────────────────

export const canvasAiSuggestionSchema = wrappers.suggestion;

export type CanvasAiSuggestion = z.infer<typeof canvasAiSuggestionSchema>;

// ── Snapshot (canvas → AI input) ────────────────────────────────────────────

/** Core element kinds plus the brand's `balken`, after `circle-badge`. */
const [illustration, asset, shape, icon, pillBadge, circleBadge, ...afterBadges] =
  CORE_CANVAS_AI_ELEMENT_KINDS;

export const canvasAiSnapshotSchema = createCanvasAiSnapshotSchema([
  illustration,
  asset,
  shape,
  icon,
  pillBadge,
  circleBadge,
  'balken',
  ...afterBadges,
]);

export type CanvasAiSnapshot = z.infer<typeof canvasAiSnapshotSchema>;

// ── Response ─────────────────────────────────────────────────────────────────

/**
 * Legacy suggestions shape, unused by the planner (it emits
 * `canvasAiPlannedBatchSchema`); kept for type re-exports.
 */
export const canvasAiSuggestResponseSchema = wrappers.suggestResponse;

export type CanvasAiSuggestResponse = z.infer<typeof canvasAiSuggestResponseSchema>;

/**
 * The planner's actual output: ONE operation batch with a short German title.
 * Planner-internal, not on the wire.
 */
export const canvasAiPlannedBatchSchema = wrappers.plannedBatch;

export type CanvasAiPlannedBatch = z.infer<typeof canvasAiPlannedBatchSchema>;

// ── Sharepic chat edit (single applied edit, not suggestions) ───────────────

/**
 * Tool-call response shape for the chat's `sharepic_edit` intent: ONE batch
 * of operations that is applied immediately. `summary` (German, e.g. "Zeile 2
 * gekürzt") becomes the version-history label, `reply` the assistant's
 * confirmation text in the thread.
 */
export const sharepicEditResponseSchema = wrappers.editResponse;

export type SharepicEditResponse = z.infer<typeof sharepicEditResponseSchema>;

/** Model output may decline an edit; applied edits still require operations. */
export const sharepicEditDecisionSchema = wrappers.editDecision;

// ── Slider deck operations (multi-page chat editing) ────────────────────────

/**
 * Deck-level wrapper around the single-page operation vocabulary. `edit-slide`
 * reuses `canvasAiOperationSchema` unchanged, so the per-page interpreter
 * (`sharepicOpsToStatePatch`) keeps doing the clamping/rejecting.
 */
export const sliderDeckOperationSchema = wrappers.deckOperation;

export type SliderDeckOperation = z.infer<typeof sliderDeckOperationSchema>;

// ── Vision check after an applied edit ──────────────────────────────────────

export const canvasAiCheckBodySchema = z.object({
  /** PNG/JPEG data URL of the canvas page after the edit. */
  image: z.string().startsWith('data:image/').max(8_000_000),
  /** What the person asked for, so the check can say whether it visibly happened. */
  instruction: z.string().trim().min(1).max(2000),
});

export type CanvasAiCheckBody = z.infer<typeof canvasAiCheckBodySchema>;

export const canvasAiCheckResponseSchema = z.object({
  ok: z.boolean(),
  /** At most three short German findings. */
  issues: z.array(z.object({ text: z.string() })).max(3),
});

export type CanvasAiCheckResponse = z.infer<typeof canvasAiCheckResponseSchema>;
