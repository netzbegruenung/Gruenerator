/**
 * Zod schemas for per-user learned writing styles ("angelernte Textformen").
 *
 * Source of truth for the /api/text-forms request/response shapes. A text form is
 * a PRESET (Instagram/Facebook/Presse/Antrag — maps onto a system skill and
 * replaces its standard prompt when active), a RECIPE override (the same, for one
 * Landesverbands-Rezept) or a CUSTOM form (a user-defined slash mention like
 * "/omveinladungen", injected additively). `mention` is the runtime lookup key —
 * exakt, nichts wird gefaltet; `styleBlock` is the edited markdown that gets
 * injected.
 */
import { z } from 'zod';

import { publicOwnershipSchema } from './notebookCollections.js';

// ── Closed sets ──────────────────────────────────────────────────────────────

/** Preset text types. instagram/facebook/presse coincide with system-skill
 * mentions; antrag stands alone. Closed set → z.enum, never z.string(). */
export const textFormTypeSchema = z.enum(['instagram', 'facebook', 'presse', 'antrag']);
export type TextFormType = z.infer<typeof textFormTypeSchema>;

/**
 * Wie ein Textyp benannt wird — im Titelfeld der Agentura wie in der Überschrift
 * des analysierten Stilblocks („## STIL: Instagram-Posts"). Eine Quelle, weil
 * beide Seiten dieselbe Beschriftung meinen: stünde im Editor „Instagram" und im
 * Block „Instagram-Posts", wäre unklar, welche der beiden das Modell liest.
 */
export const TEXT_FORM_TYPE_LABELS: Record<TextFormType, string> = {
  instagram: 'Instagram-Posts',
  facebook: 'Facebook-Posts',
  presse: 'Pressemitteilungen',
  antrag: 'Anträge',
};

/**
 * Wer eine Textform sehen/nutzen darf — dieselbe Achse wie bei User-Agenten
 * (`userAgentShareModeSchema`), nur ohne `audience`: Rezepte haben keine
 * Länder-Zielgruppe, das Feld existiert für Agenten wegen ihres `locale`.
 */
export const textFormShareModeSchema = z.enum(['private', 'groups', 'authenticated']);
export type TextFormShareMode = z.infer<typeof textFormShareModeSchema>;

/**
 * Woher die Mention einer angelernten Textform stammt — und damit, ob sie ein
 * mitgeliefertes Rezept überschreibt oder ein eigenes anlegt.
 *
 *  - `preset`  — einer der vier Textyp-Schlüssel (`presse`, `instagram`, …).
 *                Die Mention IST der Textyp; die Form ersetzt den Rumpf des
 *                gleichnamigen Systemrezepts.
 *  - `recipe`  — die Mention eines Landesverbands-Rezepts (`presse-hessen-partei`).
 *                Ersetzt ebenfalls dessen Rumpf, taucht aber wie ein Preset NICHT
 *                als eigene Zeile im Rezept-Menü auf: das Rezept steht dort schon.
 *  - `custom`  — eine selbst vergebene Mention (`/omveinladungen`). Die einzige
 *                Art, die dem Modell als zusätzlicher Katalogeintrag angeboten
 *                wird (`buildRecipeCatalog`).
 *
 * `recipe` kam 08/2026 dazu (#2930): davor faltete das Backend jedes LV-Rezept
 * auf seinen Textyp, ein generischer Presse-Stil ersetzte damit die Vorgaben
 * von zwanzig Rezepten, und ein eigener Stil je Rezept war gar nicht speicherbar.
 * Additiv — die Spalte ist `text` mit Default `'custom'`, ältere Zeilen bleiben
 * gültig.
 */
export const textFormKindSchema = z.enum(['preset', 'custom', 'recipe']);
export type TextFormKind = z.infer<typeof textFormKindSchema>;

/** Slash-mention slug for custom forms — same rule as the skill frontmatter
 * `mention` (lowercase, digits, hyphens, umlauts). Used verbatim as `/mention`. */
export const textFormMentionSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9äöüß-]+$/, 'Nur Kleinbuchstaben, Ziffern, Bindestriche (Umlaute erlaubt)');

export const MAX_TEXT_FORM_EXAMPLES = 20;
/**
 * Gesamtbudget über ALLE Beispiele zusammen — die eigentliche Grenze. ~40k Token,
 * gerechnet mit ~3,5 Zeichen/Token für deutsche Prosa, also gut innerhalb des
 * 128k-Kontexts des Analyse-Modells.
 */
export const MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS = 140_000;
/**
 * Ein einzelnes Beispiel darf das Gesamtbudget ausschöpfen: Nutzer:innen fügen
 * alle Beispiele in ein Feld ein, und ein Text, den die Zerlegung nicht trennen
 * kann, soll nicht an einer zweiten, kleineren Grenze scheitern.
 */
export const MAX_TEXT_FORM_EXAMPLE_CHARS = MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS;
export const MAX_TEXT_FORM_STYLE_CHARS = 8000;

/**
 * Titellänge. Das Eingabefeld muss dieselbe Zahl tragen — stand dort mehr (es
 * waren 100), ließ sich ein Name tippen, den erst der Server ablehnt.
 */
export const MAX_TEXT_FORM_TITLE_CHARS = 80;

export const MAX_TEXT_FORM_DESCRIPTION_CHARS = 500;
/** Short blurb shown next to the recipe in the Agentura/mention picker. */
export const textFormDescriptionSchema = z.string().max(MAX_TEXT_FORM_DESCRIPTION_CHARS);
/** Icon key from the shared icon catalog, same shape as agents' `iconKey`. */
export const textFormIconKeySchema = z.string().max(64);

// ── Shared shapes ────────────────────────────────────────────────────────────

export const textFormExampleSchema = z.object({
  content: z.string().min(1).max(MAX_TEXT_FORM_EXAMPLE_CHARS),
});
export type TextFormExample = z.infer<typeof textFormExampleSchema>;

export function textFormExamplesChars(
  examples: ReadonlyArray<{ readonly content: string }>
): number {
  return examples.reduce((sum, e) => sum + e.content.length, 0);
}

const withinTotalBudget = {
  check: (examples: ReadonlyArray<{ readonly content: string }>) =>
    textFormExamplesChars(examples) <= MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS,
  message: `Alle Beispiele zusammen dürfen höchstens ${MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS.toLocaleString('de-DE')} Zeichen haben.`,
} as const;

/** A group a recipe is shared with. */
export const textFormGroupShareSchema = z.object({
  groupId: z.string(),
  groupName: z.string(),
});
export type TextFormGroupShare = z.infer<typeof textFormGroupShareSchema>;

/** A learned text form ("Rezept") as returned to the client. */
export const textFormSchema = z.object({
  /** Row id — the handle group shares point at. */
  id: z.string(),
  kind: textFormKindSchema,
  textType: textFormTypeSchema.nullable(),
  mention: z.string(),
  title: z.string(),
  examples: z.array(textFormExampleSchema).readonly(),
  styleBlock: z.string(),
  model: z.string().nullable(),
  analyzedAt: z.string().nullable(),
  updatedAt: z.string(),
  /** Groups the owner shared this recipe with. Empty for recipes owned by others. */
  sharedWithGroups: z.array(textFormGroupShareSchema).default([]),
  /**
   * Set only on recipes that reached the user through a group share. The UI
   * lists those separately and does not offer editing or re-sharing.
   */
  sharedFromGroup: z.string().nullable().default(null),
  /** Display name of the owner, for recipes shared into one of the user's groups. */
  ownerName: z.string().nullable().default(null),
  /** Short blurb for the Agentura/mention picker. */
  description: z.string().nullable().default(null),
  iconKey: z.string().nullable().default(null),
  /** Who can see/use this recipe — same axis as user agents. */
  shareMode: textFormShareModeSchema.default('private'),
  /** Listed in the public Agentura directory, atop shareMode='authenticated'. */
  isPublic: z.boolean().default(false),
  publicOwnership: publicOwnershipSchema.nullable().default(null),
});
export type TextForm = z.infer<typeof textFormSchema>;

// ── Request bodies ───────────────────────────────────────────────────────────

/**
 * POST /api/text-forms/analyze — distill a style block from examples (not
 * persisted). `title` labels the analysis and is always required — same field,
 * same bounds as `saveTextFormBodySchema`, so there is no "one of the two" rule
 * to enforce at runtime. `textType` is carried for the record, not to relabel:
 * the label is what the person typed. At least one example is required.
 */
export const analyzeTextFormBodySchema = z.object({
  textType: textFormTypeSchema.nullish(),
  title: z.string().trim().min(1).max(MAX_TEXT_FORM_TITLE_CHARS),
  examples: z
    .array(textFormExampleSchema)
    .min(1)
    .max(MAX_TEXT_FORM_EXAMPLES)
    .refine(withinTotalBudget.check, { message: withinTotalBudget.message }),
});
export type AnalyzeTextFormBody = z.infer<typeof analyzeTextFormBodySchema>;

/**
 * PUT /api/text-forms/:mention — upsert a form. `kind` selects preset, recipe or
 * custom; presets carry `textType` (und `recipe` trägt ihn als Beschriftung für
 * die Analyse). `styleBlock` is the edited text to inject.
 *
 * `kind` is optional — and even when sent it is only a wish. The server derives
 * it from the MENTION (`resolveTextFormKind`), never from an existing row: the
 * mention decides whether a save fills a preset, overrides a Landesverbands
 * recipe or creates a custom one, and a sent `kind` that contradicts it is
 * refused. The Agentura save form does not ask for it at all.
 */
export const saveTextFormBodySchema = z.object({
  kind: textFormKindSchema.optional(),
  textType: textFormTypeSchema.nullish(),
  title: z.string().min(1).max(MAX_TEXT_FORM_TITLE_CHARS),
  examples: z
    .array(textFormExampleSchema)
    .max(MAX_TEXT_FORM_EXAMPLES)
    .refine(withinTotalBudget.check, { message: withinTotalBudget.message }),
  styleBlock: z.string().min(1).max(MAX_TEXT_FORM_STYLE_CHARS),
  description: textFormDescriptionSchema.nullish(),
  iconKey: textFormIconKeySchema.nullish(),
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

/** Body for sharing a recipe with a group / revoking that share. */
export const textFormShareBodySchema = z.object({
  group_id: z.string(),
});
export type TextFormShareBody = z.infer<typeof textFormShareBodySchema>;

export const textFormShareResponseSchema = z.object({
  success: z.boolean(),
  sharedWithGroups: z.array(textFormGroupShareSchema),
});

// ── Mentionable list ─────────────────────────────────────────────────────────

/**
 * The lean projection the @-mention picker needs — mirrors
 * `mentionableUserAgentSchema`. `sharedFromGroup` is the group a recipe reached
 * the caller through, `null` for their own.
 */
export const mentionableTextFormSchema = z.object({
  id: z.string(),
  mention: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  iconKey: z.string().nullable(),
  kind: textFormKindSchema,
  sharedFromGroup: z.string().nullable(),
  ownerName: z.string().nullable(),
  isPublic: z.boolean(),
});
export type MentionableTextForm = z.infer<typeof mentionableTextFormSchema>;

export const mentionableTextFormsListResponseSchema = z.object({
  success: z.boolean(),
  forms: z.array(mentionableTextFormSchema),
});

// ── Sharing ──────────────────────────────────────────────────────────────────

/**
 * Current share settings for one recipe. snake_case like
 * `userAgentShareSettingsSchema` — no `audience`: recipes have no locale.
 */
export const textFormShareSettingsSchema = z.object({
  share_mode: textFormShareModeSchema,
  is_public: z.boolean(),
  public_ownership: publicOwnershipSchema.nullable(),
});
export type TextFormShareSettings = z.infer<typeof textFormShareSettingsSchema>;

export const textFormShareModeBodySchema = z.object({
  mode: textFormShareModeSchema,
});

/**
 * Toggle Agentura discovery on top of `share_mode='authenticated'`.
 * `public_ownership` MUST be non-null when `is_public=true` (legal attestation
 * for community listing). When `is_public=false`, ownership is cleared
 * server-side regardless of what's sent.
 */
export const textFormIsPublicBodySchema = z.object({
  is_public: z.boolean(),
  public_ownership: publicOwnershipSchema.nullable(),
});

// ── Draft ────────────────────────────────────────────────────────────────────

/**
 * POST /api/text-forms/draft — synthesize a spec from a one-shot freeform
 * brief. Mirrors `draftAgentBodySchema`.
 */
export const draftRecipeBodySchema = z.object({
  description: z.string().min(1).max(2000),
});
export type DraftRecipeBody = z.infer<typeof draftRecipeBodySchema>;

/**
 * The recipe spec the creator synthesizes from the conversation. Field names
 * match `saveTextFormBodySchema` so the frontend can hand the spec straight to
 * the save call.
 */
export const draftedRecipeSpecSchema = z.object({
  title: z.string(),
  mention: z.string(),
  description: z.string(),
  iconKey: z.string(),
  styleBlock: z.string(),
});
export type DraftedRecipeSpec = z.infer<typeof draftedRecipeSpecSchema>;

export const textFormDraftResponseSchema = z.object({
  success: z.boolean(),
  spec: draftedRecipeSpecSchema,
});

/**
 * Ein fremdes Rezept, wie der offene Katalog es zeigt.
 *
 * Ohne `examples`: das sind die Originaltexte der Person, aus denen der Stil
 * gelernt wurde — veröffentlicht wurde die ANWEISUNG, nicht ihr Rohstoff. Ohne
 * `sharedWithGroups`: das nennt die Projekte des Eigentümers und geht niemanden
 * sonst etwas an. `styleBlock` bleibt drin — er IST das Veröffentlichte, und die
 * Detailseite zeigt ihn. `exampleCount` tritt an die Stelle der Beispiele, damit
 * die Karte sagen kann, auf wie vielen Texten ein Rezept beruht.
 */
export const publicTextFormSchema = textFormSchema
  .omit({ examples: true, sharedWithGroups: true })
  .extend({ exampleCount: z.number().int().nonnegative() });
export type PublicTextForm = z.infer<typeof publicTextFormSchema>;

/** Public Agentura discovery feed. */
export const publicTextFormsResponseSchema = z.object({
  success: z.boolean(),
  forms: z.array(publicTextFormSchema),
});
