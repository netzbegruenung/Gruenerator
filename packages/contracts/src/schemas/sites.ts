/**
 * Zod schemas for the candidate-site builder (/api/sites).
 *
 * `siteSectionsSchema` is the canonical shape of the `sections` jsonb column:
 * an OBJECT keyed by section name. The legacy backend type
 * (apps/api/routes/sites/types.ts) declared `SiteSection[]`, but every site
 * written by the editor stores this object form.
 */
import { z } from 'zod';

import {
  boundedRichTextDoc,
  SITE_ABOUT_MAX_LENGTH,
  SITE_THEME_CONTENT_MAX_LENGTH,
} from './richtext.js';

export const siteThemeCardSchema = z.object({
  imageUrl: z.string(),
  title: z.string(),
  content: boundedRichTextDoc(SITE_THEME_CONTENT_MAX_LENGTH),
});
export type SiteThemeCard = z.infer<typeof siteThemeCardSchema>;

export const siteActionTileSchema = z.object({
  imageUrl: z.string(),
  text: z.string(),
  link: z.string(),
});
export type SiteActionTile = z.infer<typeof siteActionTileSchema>;

export const siteSectionsSchema = z.object({
  heroImage: z.object({ imageUrl: z.string(), title: z.string(), subtitle: z.string() }).optional(),
  about: z
    .object({ title: z.string(), content: boundedRichTextDoc(SITE_ABOUT_MAX_LENGTH) })
    .optional(),
  themes: z.array(siteThemeCardSchema).optional(),
  actions: z.array(siteActionTileSchema).optional(),
  contact: z.object({ title: z.string(), backgroundImageUrl: z.string() }).optional(),
  socialFeed: z
    .object({
      title: z.string(),
      instagramUsername: z.string().optional(),
      showFeed: z.boolean(),
    })
    .optional(),
});
export type SiteSections = z.infer<typeof siteSectionsSchema>;

/** Mirrors the user_sites row (apps/api/database/schema/sites.ts) as serialized to JSON. */
export const siteSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  subdomain: z.string(),
  is_published: z.boolean().nullable(),
  site_title: z.string(),
  tagline: z.string().nullable(),
  contact_email: z.string().nullable(),
  contact_phone: z.string().nullable(),
  contact_website: z.string().nullable(),
  social_links: z.record(z.string(), z.string()).nullable(),
  theme: z.string().nullable(),
  accent_color: z.string().nullable(),
  profile_image: z.string().nullable(),
  background_image: z.string().nullable(),
  sections: siteSectionsSchema.nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  last_published: z.string().nullable(),
  visit_count: z.number().nullable(),
  meta_description: z.string().nullable(),
  meta_keywords: z.array(z.string()).nullable(),
});
export type Site = z.infer<typeof siteSchema>;

export const siteResponseSchema = z.object({ site: siteSchema });
export const mySiteResponseSchema = z.object({ site: siteSchema.nullable() });

export const createSiteBodySchema = z.object({
  subdomain: z.string().min(1),
  site_title: z.string().min(1),
  tagline: z.string().optional(),
  theme: z.string().optional(),
  contact_email: z.string().optional(),
  social_links: z.record(z.string(), z.string()).optional(),
  profile_image: z.string().optional(),
  background_image: z.string().optional(),
  sections: siteSectionsSchema.optional(),
});
export type CreateSiteBody = z.infer<typeof createSiteBodySchema>;

export const updateUserSiteBodySchema = z.object({
  site_title: z.string().optional(),
  tagline: z.string().optional(),
  contact_email: z.string().optional(),
  social_links: z.record(z.string(), z.string()).optional(),
  accent_color: z.string().optional(),
  profile_image: z.string().optional(),
  background_image: z.string().optional(),
  sections: siteSectionsSchema.optional(),
  meta_description: z.string().optional(),
  meta_keywords: z.array(z.string()).optional(),
});
export type UpdateSiteBody = z.infer<typeof updateUserSiteBodySchema>;

export const publishSiteBodySchema = z.object({ publish: z.boolean() });

export const checkSubdomainResponseSchema = z.object({
  available: z.boolean(),
  reason: z.enum(['invalid', 'reserved']).optional(),
});

export const deleteSiteResponseSchema = z.object({ success: z.boolean() });

export const sitesErrorSchema = z.object({ error: z.string() });
