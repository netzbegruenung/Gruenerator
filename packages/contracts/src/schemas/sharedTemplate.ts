/**
 * Zod schemas for the link-shared view of a Grünerator-Vorlage.
 *
 * A Vorlage is a `user_templates` bridge row pointing at a frozen snapshot
 * canvas; "using" it clones that canvas. Visibility therefore lives on the
 * snapshot (`collaborative_documents.share_mode`), which is the same axis the
 * document share dialog writes — so a Vorlage is shared exactly like a
 * document: privat, mit Anmeldung, öffentlich, plus group shares.
 *
 * This is deliberately independent of the gallery axis (`is_private` +
 * `status`): listing a Vorlage in the öffentliche Vorlagen-Galerie needs an
 * admin review, sharing it with your Gruppe or by link does not.
 */
import { z } from 'zod';

// ── Closed sets ──────────────────────────────────────────────────────────────

/**
 * The two link modes a shared Vorlage can be viewed under. `private` never
 * reaches a viewer (the endpoint 404s instead), so it is not part of the set.
 */
export const sharedTemplateShareModeSchema = z.enum(['authenticated', 'public']);
export type SharedTemplateShareMode = z.infer<typeof sharedTemplateShareModeSchema>;

// ── Response shape ───────────────────────────────────────────────────────────

/**
 * What a link visitor gets to see. Deliberately a thin card — title, blurb,
 * preview — plus the snapshot's id so an authenticated visitor can clone it.
 * The canvas state itself is NOT included: rendering it belongs to the studio,
 * behind the normal canvas access check.
 */
export const sharedTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  preview_image_url: z.string().nullable(),
  /** The frozen snapshot canvas cloned by "Vorlage verwenden". */
  canvas_id: z.string(),
  share_mode: sharedTemplateShareModeSchema,
  /** Display name of the person who shared it, when they have one. */
  shared_by: z.string().nullable(),
});
export type SharedTemplate = z.infer<typeof sharedTemplateSchema>;

export const sharedTemplateResponseSchema = z.object({
  success: z.literal(true),
  data: sharedTemplateSchema,
});

export const sharedTemplateErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});
