/**
 * Zod schemas for websites connected to a user account.
 *
 * A website is a user-level resource: its identity and category catalogue live
 * here, while which categories a given notebook imports stays in that
 * notebook's `wordpress_sites` ref (which points here via `websiteId`).
 *
 * `usage` is derived per request from the user's documents — never stored —
 * so it cannot drift away from what is actually in the notebooks.
 */
import { z } from 'zod';

/** Only WordPress exists today; sitemap/RSS sources would extend this. */
export const websitePlatformSchema = z.enum(['wordpress']);
export type WebsitePlatform = z.infer<typeof websitePlatformSchema>;

export const websiteCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  count: z.number(),
});
export type WebsiteCategory = z.infer<typeof websiteCategorySchema>;

/** How much of this website already sits in the user's notebooks. */
export const websiteUsageSchema = z.object({
  documentCount: z.number(),
  notebookCount: z.number(),
  notebookNames: z.array(z.string()),
  /** Imported documents per category id — drives the "learn from X posts" hints. */
  documentsByCategory: z.record(z.string(), z.number()),
});
export type WebsiteUsage = z.infer<typeof websiteUsageSchema>;

export const userWebsiteSchema = z.object({
  id: z.string(),
  siteUrl: z.string(),
  siteName: z.string(),
  platform: websitePlatformSchema,
  categories: z.array(websiteCategorySchema),
  totalPosts: z.number(),
  totalPages: z.number(),
  discoveredAt: z.string().nullable(),
  usage: websiteUsageSchema,
});
export type UserWebsite = z.infer<typeof userWebsiteSchema>;

// ── Request bodies ───────────────────────────────────────────────────────────

/**
 * Adding a website probes it first — the caller passes the raw URL and the
 * server stores the normalised one alongside the discovery snapshot.
 */
export const addUserWebsiteBodySchema = z.object({
  site_url: z.string(),
});
export type AddUserWebsiteBody = z.infer<typeof addUserWebsiteBodySchema>;

export const userWebsiteListResponseSchema = z.object({
  success: z.literal(true),
  websites: z.array(userWebsiteSchema),
});
export type UserWebsiteListResponse = z.infer<typeof userWebsiteListResponseSchema>;

export const userWebsiteResponseSchema = z.object({
  success: z.literal(true),
  website: userWebsiteSchema,
});
export type UserWebsiteResponse = z.infer<typeof userWebsiteResponseSchema>;

export const userWebsiteErrorSchema = z.object({
  error: z.string(),
  /** Mirrors the WordPress discovery codes so the UI can reuse its messages. */
  code: z
    .enum([
      'invalid_url',
      'no_scopes',
      'not_wordpress',
      'rest_disabled',
      'fetch_failed',
      'internal',
      'not_found',
      'duplicate',
    ])
    .nullish(),
});
export type UserWebsiteError = z.infer<typeof userWebsiteErrorSchema>;
