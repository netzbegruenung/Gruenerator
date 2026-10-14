/**
 * Zod schemas for template (Vorlagen) likes & favorites.
 *
 * Source of truth for the /api/auth/templates/* interaction endpoints. These
 * apply to ANY gallery template — system templates, system files, and published
 * user vorlagen alike — so they are keyed on the gallery item id (string), not
 * the user_templates PK.
 */
import { z } from 'zod';

import { sharepicVorlageSchema, vorlagenLandQuerySchema } from './sharepicVorlagen.js';

// ── Gallery template (favorites resolution) ──────────────────────────────────

/**
 * A gallery item as returned by GET /auth/vorlagen. The gallery serves
 * published user-submitted vorlagen; the shape is intentionally loose and
 * passthrough-friendly — the favorites endpoint resolves favorited ids back to
 * whichever objects exist.
 */
export const galleryTemplateSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    title: z.string().optional(),
    description: z.string().nullish(),
    template_type: z.unknown().optional(),
    thumbnail_url: z.string().nullish(),
    external_url: z.string().nullish(),
    download_url: z.string().optional(),
    images: z.array(z.unknown()).optional(),
    categories: z.array(z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
    content_data: z.unknown().optional(),
    metadata: z.unknown().optional(),
    likes_count: z.number().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

export type GalleryTemplate = z.infer<typeof galleryTemplateSchema>;

// ── Error ────────────────────────────────────────────────────────────────────

export const templateInteractionErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});

// ── Likes ────────────────────────────────────────────────────────────────────

export const listMyLikedTemplatesResponseSchema = z.object({
  success: z.literal(true),
  liked_ids: z.array(z.string()),
});

export const likeTemplateResponseSchema = z.object({
  success: z.literal(true),
  liked: z.literal(true),
  count: z.number(),
});

export const unlikeTemplateResponseSchema = z.object({
  success: z.literal(true),
  liked: z.literal(false),
  count: z.number(),
});

// ── Favorites ──────────────────────────────────────────────────────────────

export const listMyFavoriteTemplatesResponseSchema = z.object({
  success: z.literal(true),
  favorite_ids: z.array(z.string()),
  templates: z.array(galleryTemplateSchema),
});

export const favoriteTemplateResponseSchema = z.object({
  success: z.literal(true),
  favorited: z.literal(true),
});

export const unfavoriteTemplateResponseSchema = z.object({
  success: z.literal(true),
  favorited: z.literal(false),
});

// ── Engagement (counts on gallery cards) ─────────────────────────────────────

export const templateEngagementSchema = z.object({
  id: z.string(),
  likes_count: z.number().int().nonnegative(),
});

/** Comma-separated gallery item ids (user template UUIDs and catalogue ids). */
export const templateEngagementQuerySchema = z.object({
  ids: z.string().min(1).max(8000),
});

export const templateEngagementResponseSchema = z.object({
  success: z.literal(true),
  items: z.array(templateEngagementSchema),
});

// ── Beliebte Vorlagen (studio row) ───────────────────────────────────────────

export const popularVorlagenQuerySchema = vorlagenLandQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(12).default(4),
});

const engagementFields = {
  likes_count: z.number().int().nonnegative(),
};

/** `catalog`: Grünerator-Vorlage from the private catalogue; `user`: a gallery user template (Canva, Grünerator-Canvas, …). */
export const popularVorlageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('catalog'), vorlage: sharepicVorlageSchema, ...engagementFields }),
  z.object({ kind: z.literal('user'), template: galleryTemplateSchema, ...engagementFields }),
]);

export const popularVorlagenResponseSchema = z.object({
  success: z.literal(true),
  items: z.array(popularVorlageSchema),
});

export type TemplateEngagement = z.infer<typeof templateEngagementSchema>;
export type TemplateEngagementResponse = z.infer<typeof templateEngagementResponseSchema>;
export type PopularVorlage = z.infer<typeof popularVorlageSchema>;
