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
});
export type SharepicVorlage = z.infer<typeof sharepicVorlageSchema>;

export const sharepicVorlagenListResponseSchema = z.object({
  vorlagen: z.array(sharepicVorlageSchema),
});

export const sharepicVorlagenErrorSchema = z.object({ error: z.string() });

/** The preview image, served from the private checkout — needs the session like every API call. */
export const sharepicVorlageThumbPath = (id: string): string =>
  `/api/sharepic-vorlagen/${encodeURIComponent(id)}/thumb`;
