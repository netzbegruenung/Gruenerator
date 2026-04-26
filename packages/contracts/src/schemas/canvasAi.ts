/**
 * Zod schemas for canvas AI suggestions.
 *
 * Source of truth for:
 *   - TypeScript types in @gruenerator/canvas-editor (operation discriminator)
 *   - Backend Zod validation of LLM tool-call arguments
 *   - JSON-schema fed to the LLM via tool calling (zod-to-json-schema)
 *   - ts-rest contract response shape
 *
 * Design notes:
 *   - All fields use `.nullish()` per the 2026-04-12 production-incident rule
 *     for any optional field traversed at runtime.
 *   - The discriminator key is `kind` for consistency with the rest of the
 *     canvas-editor package (which already uses `kind` in CanvasAiOperation).
 *   - When adding a new operation kind, the exhaustive switch in
 *     packages/canvas-editor/src/ai/applyOperation.ts will fail to compile —
 *     that is intentional defensive design.
 */
import { z } from 'zod';

// ── Operations ──────────────────────────────────────────────────────────────

const HexColor = z
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
  /** Color scheme id from TemplateAiCapabilities.colorSchemes. */
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
  /** Illustration id from TemplateAiCapabilities.illustrations. */
  illustrationId: z.string().min(1),
  color: HexColor.nullish(),
});

export const addAssetOperation = z.object({
  kind: z.literal('add-asset'),
  /** Asset id from TemplateAiCapabilities.assets. */
  assetId: z.string().min(1),
});

export const removeElementOperation = z.object({
  kind: z.literal('remove-element'),
  /** Existing element instance id. */
  elementId: z.string().min(1),
});

export const toggleSunflowerOperation = z.object({
  kind: z.literal('toggle-sunflower'),
  visible: z.boolean(),
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
 * Mutate an existing on-canvas element by id. The AI only sees elements
 * listed in CanvasAiSnapshot.elementsSummary, so it can only target ids
 * the snapshot exposed.
 *
 * Each patch field is independently optional. The applier dispatches by
 * looking up the element's kind from current state and forwarding the
 * patch to the appropriate update action (updateIllustration, etc.).
 */
/**
 * Patch shape for `update-element`. Exported separately so the canvas-editor
 * applier can use it as the canonical update-action parameter type.
 *
 * All fields independently optional; the discriminated-union variant below
 * enforces "at least one field" at parse time.
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

export const canvasAiOperationSchema = z.discriminatedUnion('kind', [
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
]);

export type CanvasAiOperation = z.infer<typeof canvasAiOperationSchema>;
export type CanvasAiOperationKind = CanvasAiOperation['kind'];

// ── Suggestions ─────────────────────────────────────────────────────────────

export const canvasAiSuggestionSchema = z.object({
  /**
   * Stable id for React keys + apply-results tracking. Models often omit
   * it; `.default` synthesises one at parse time. The output type is
   * still `string` (not `string | undefined`), so consumers don't need
   * to handle a missing id.
   */
  id: z
    .string()
    .min(1)
    .default(() =>
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `s-${Math.random().toString(36).slice(2, 11)}`
    ),
  /** Short headline for the suggestion card (max 80 chars). */
  title: z.string().min(1).max(80),
  /** Optional longer explanation of what this suggestion changes. */
  description: z.string().max(280).nullish(),
  operations: z.array(canvasAiOperationSchema).min(1).max(8),
});

export type CanvasAiSuggestion = z.infer<typeof canvasAiSuggestionSchema>;

// ── Snapshot (canvas → AI input) ────────────────────────────────────────────

export const canvasAiSnapshotSchema = z.object({
  /** Canvas template id (e.g. 'simple', 'dreizeilen'). */
  template: z.string().min(1),
  /** Named text fields the AI may target with set-text. */
  textFields: z.array(
    z.object({
      field: z.string().min(1),
      label: z.string().min(1),
      value: z.string(),
    })
  ),
  /** Active color scheme id, if applicable. */
  currentColorScheme: z.string().nullish(),
  /** Active solid background color in #rrggbb, if applicable. */
  currentBackgroundColor: HexColor.nullish(),
  /** Active presentation color mode, if applicable. */
  currentColorMode: z.enum(['light', 'dark']).nullish(),
  /** Existing on-canvas elements the AI may reference / remove. */
  elementsSummary: z.array(
    z.object({
      id: z.string().min(1),
      kind: z.enum([
        'illustration',
        'asset',
        'shape',
        'icon',
        'pill-badge',
        'circle-badge',
        'balken',
        'frame',
        'user-image',
        'text',
      ]),
      label: z.string(),
    })
  ),
});

export type CanvasAiSnapshot = z.infer<typeof canvasAiSnapshotSchema>;

// ── Capabilities (canvas → AI prompt context) ───────────────────────────────

export const canvasAiCapabilitiesSchema = z.object({
  supportedOperations: z.array(z.string().min(1)).min(1),
  colorSchemes: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).nullish(),
  illustrations: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).nullish(),
  assets: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).nullish(),
});

export type CanvasAiCapabilities = z.infer<typeof canvasAiCapabilitiesSchema>;

// ── Request / response ──────────────────────────────────────────────────────

export const canvasAiSuggestRequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  snapshot: canvasAiSnapshotSchema,
  capabilities: canvasAiCapabilitiesSchema,
});

export const canvasAiSuggestResponseSchema = z.object({
  suggestions: z.array(canvasAiSuggestionSchema).min(0).max(6),
});

export const canvasAiSuggestErrorSchema = z.object({
  error: z.string(),
});

export type CanvasAiSuggestRequest = z.infer<typeof canvasAiSuggestRequestSchema>;
export type CanvasAiSuggestResponse = z.infer<typeof canvasAiSuggestResponseSchema>;
