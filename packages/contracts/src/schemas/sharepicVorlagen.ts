/**
 * Grünerator-Vorlagen for sharepics: ready creator specs people copy and edit,
 * each with the chat prompts that would produce one like it.
 *
 * Only the shape lives here. The entries are party content and live in the
 * private checkout (`<INTERN_CONTENT_DIR>/sharepic-vorlagen/{de,at}.json`),
 * served by `/api/sharepic-vorlagen` — never bundled.
 */
import { z } from 'zod';

import {
  sharepicCreatorLocaleSchema,
  sharepicFormatSchema,
  sharepicFormSchema,
  sharepicPhotoAttributionSchema,
  sharepicSpecSchema,
} from './sharepicCreator.js';

export const sharepicVorlageIdSchema = z.string().regex(/^[a-z0-9-]{3,64}$/);

/** Where an entry comes from: a rebuilt party post, or one of the retired template types. */
export const sharepicVorlageHerkunftSchema = z.enum(['beispiel', 'alt-template']);
export type SharepicVorlageHerkunft = z.infer<typeof sharepicVorlageHerkunftSchema>;

/** One entry as the private file holds it. Its locale is `spec.locale`. */
export const sharepicVorlageFileEntrySchema = z.object({
  id: sharepicVorlageIdSchema,
  titel: z.string().min(1).max(80),
  beschreibung: z.string().min(1).max(280),
  /**
   * What a post needs to fit this Vorlage („Termin mit Datum und Ort",
   * „längeres Statement einer Person"). `beschreibung` says how it looks; the
   * chat picks Vorlagen for a post by this line, falling back to `beschreibung`.
   */
  anlass: z.string().min(1).max(160).optional(),
  form: sharepicFormSchema,
  herkunft: sharepicVorlageHerkunftSchema,
  /** Requests in the country's own words that make the creator build one like it. */
  chat: z.object({ prompts: z.array(z.string().min(3).max(240)).min(1).max(4) }),
  spec: sharepicSpecSchema,
});
export type SharepicVorlageFileEntry = z.infer<typeof sharepicVorlageFileEntrySchema>;

export const sharepicVorlageSchema = sharepicVorlageFileEntrySchema.extend({
  locale: sharepicCreatorLocaleSchema,
  /** Stock photo credits, one per slide (null on colour or painted slides). */
  attributions: z.array(sharepicPhotoAttributionSchema.nullable()),
  /** Content hash of the preview images; clients pass it on to `sharepicVorlageThumbPath`. */
  thumbVersion: z.string().optional(),
});
export type SharepicVorlage = z.infer<typeof sharepicVorlageSchema>;

/**
 * `?land=` on the Vorlagen lists (catalogue, gallery, „Beliebte Vorlagen"):
 * the country to show instead of the viewer's own. Honoured for instance
 * admins only; for everyone else the server ignores it.
 */
export const vorlagenLandQuerySchema = z.object({
  land: sharepicCreatorLocaleSchema.optional(),
});

export const sharepicVorlagenListResponseSchema = z.object({
  vorlagen: z.array(sharepicVorlageSchema),
});

export const sharepicVorlagenErrorSchema = z.object({ error: z.string() });

/**
 * A slide's preview image (1-based; a carousel has one per slide), served from
 * the private checkout — needs the session like every API call.
 */
export const sharepicVorlageThumbPath = (id: string, seite = 1, version?: string): string => {
  const query = new URLSearchParams();
  if (seite > 1) query.set('seite', String(seite));
  if (version) query.set('v', version);
  const search = query.toString();
  return `/api/sharepic-vorlagen/${encodeURIComponent(id)}/thumb${search ? `?${search}` : ''}`;
};

/**
 * The chat's `vorlagen_vorschlagen` result: catalogue Vorlagen picked for the
 * post at hand, each with the one line why. The same shape is the live
 * `vorlagen_suggestions` event and the persisted tool result it is rebuilt
 * from on reload.
 */
export const sharepicVorlagenSuggestionSchema = z.object({
  id: sharepicVorlageIdSchema,
  titel: z.string(),
  form: sharepicFormSchema,
  grund: z.string(),
  format: sharepicFormatSchema,
  seiten: z.number().int().min(1),
  thumbUrl: z.string(),
});
export type SharepicVorlagenSuggestion = z.infer<typeof sharepicVorlagenSuggestionSchema>;

export const sharepicVorlagenSuggestionsSchema = z.object({
  vorlagen: z.array(sharepicVorlagenSuggestionSchema).min(1),
  /** The post the Vorlagen were picked for — what „Mit meinem Text erstellen" fills in. */
  beitrag: z.string().max(3000).optional(),
});
export type SharepicVorlagenSuggestions = z.infer<typeof sharepicVorlagenSuggestionsSchema>;
