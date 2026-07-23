/**
 * Zod schemas for per-user learned writing styles ("angelernte Textformen").
 *
 * Source of truth for the /api/text-forms request/response shapes. A text form is
 * either a PRESET (Instagram/Facebook/Presse/Antrag — maps onto a system skill and
 * replaces its standard prompt when active) or a CUSTOM form (a user-defined slash
 * mention like "/omveinladungen", injected additively). `mention` is the runtime
 * lookup key; `styleBlock` is the edited markdown that gets injected verbatim.
 */
import { z } from 'zod';

// ── Closed sets ──────────────────────────────────────────────────────────────

/** Preset text types. instagram/facebook/presse coincide with system-skill
 * mentions; antrag stands alone. Closed set → z.enum, never z.string(). */
export const textFormTypeSchema = z.enum(['instagram', 'facebook', 'presse', 'antrag']);
export type TextFormType = z.infer<typeof textFormTypeSchema>;

export const textFormKindSchema = z.enum(['preset', 'custom']);
export type TextFormKind = z.infer<typeof textFormKindSchema>;

/** Slash-mention slug for custom forms — same rule as the skill frontmatter
 * `mention` (lowercase, digits, hyphens, umlauts). Used verbatim as `/mention`. */
export const textFormMentionSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9äöüß-]+$/, 'Nur Kleinbuchstaben, Ziffern, Bindestriche (Umlaute erlaubt)');

export const MAX_TEXT_FORM_EXAMPLES = 5;
export const MAX_TEXT_FORM_EXAMPLE_CHARS = 8000;
export const MAX_TEXT_FORM_STYLE_CHARS = 8000;

// ── Shared shapes ────────────────────────────────────────────────────────────

export const textFormExampleSchema = z.object({
  content: z.string().min(1).max(MAX_TEXT_FORM_EXAMPLE_CHARS),
});
export type TextFormExample = z.infer<typeof textFormExampleSchema>;

/** A learned text form as returned to the client. */
export const textFormSchema = z.object({
  kind: textFormKindSchema,
  textType: textFormTypeSchema.nullable(),
  mention: z.string(),
  title: z.string(),
  examples: z.array(textFormExampleSchema).readonly(),
  styleBlock: z.string(),
  model: z.string().nullable(),
  analyzedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type TextForm = z.infer<typeof textFormSchema>;

// ── Request bodies ───────────────────────────────────────────────────────────

/**
 * POST /api/text-forms/analyze — distill a style block from examples (not
 * persisted). For presets pass `textType`; for custom forms pass `title` so the
 * prompt can label the analysis. At least one example is required.
 */
export const analyzeTextFormBodySchema = z.object({
  textType: textFormTypeSchema.nullish(),
  title: z.string().min(1).max(80).nullish(),
  examples: z.array(textFormExampleSchema).min(1).max(MAX_TEXT_FORM_EXAMPLES),
});
export type AnalyzeTextFormBody = z.infer<typeof analyzeTextFormBodySchema>;

/**
 * PUT /api/text-forms/:mention — upsert a form. `kind` selects preset vs custom;
 * presets carry `textType`. `styleBlock` is the edited text to inject.
 */
export const saveTextFormBodySchema = z.object({
  kind: textFormKindSchema,
  textType: textFormTypeSchema.nullish(),
  title: z.string().min(1).max(80),
  examples: z.array(textFormExampleSchema).max(MAX_TEXT_FORM_EXAMPLES),
  styleBlock: z.string().min(1).max(MAX_TEXT_FORM_STYLE_CHARS),
});
export type SaveTextFormBody = z.infer<typeof saveTextFormBodySchema>;

// ── Response wrappers ─────────────────────────────────────────────────────────

export const textFormsListResponseSchema = z.object({
  success: z.boolean(),
  forms: z.array(textFormSchema),
});

export const textFormItemResponseSchema = z.object({
  success: z.boolean(),
  form: textFormSchema,
});

export const analyzeTextFormResponseSchema = z.object({
  success: z.boolean(),
  styleBlock: z.string(),
});

export const textFormDeleteResponseSchema = z.object({
  success: z.boolean(),
});

export const textFormErrorResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
