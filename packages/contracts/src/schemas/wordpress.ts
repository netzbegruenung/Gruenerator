/**
 * Zod schemas for WordPress integration endpoints.
 *
 * Covers:
 * - apps/api/routes/wordpress/wordpressApi.ts
 *
 * Response schemas use z.unknown() for external WordPress REST API v2
 * response shapes — validation of those shapes is done in
 * apps/api/services/api-clients/wordpressApiClient.ts (Phase 4.3 done).
 *
 * IMPORTANT: Request bodies use `.nullish()` for optional fields per the
 * 2026-04-12 production incident rule.
 */
import { z } from 'zod';

// ── Common ──────────────────────────────────────────────────────────────────

export const wordpressErrorSchema = z.object({ error: z.string() });

// ── POST /sites — connect a WordPress site ───────────────────────────────────

export const connectSiteBodySchema = z.object({
  siteUrl: z.string(),
  username: z.string(),
  appPassword: z.string(),
  label: z.string().nullish(),
});

export const connectSiteResponseSchema = z.object({
  success: z.boolean(),
  site: z.unknown(), // external: WordPress site record
  connectionTest: z
    .object({
      success: z.boolean(),
      error: z.string().nullable(),
    })
    .nullish(),
});

// ── PUT /sites/:id — update a WordPress site ─────────────────────────────────

export const updateSiteBodySchema = z.object({
  label: z.string().nullish(),
  is_active: z.boolean().nullish(),
  username: z.string().nullish(),
  appPassword: z.string().nullish(),
});

export const updateSiteResponseSchema = z.object({
  success: z.boolean(),
  site: z.unknown(), // external: WordPress site record
});

// ── POST /test-connection ────────────────────────────────────────────────────

export const testConnectionBodySchema = z.object({
  siteUrl: z.string(),
  username: z.string(),
  appPassword: z.string(),
});

// external: WordPress REST API v2 test-connection response
export const testConnectionResponseSchema = z.unknown();

// ── POST /publish ────────────────────────────────────────────────────────────

export const publishPostBodySchema = z.object({
  siteId: z.string(),
  title: z.string(),
  content: z.string(),
  status: z.enum(['draft', 'publish', 'pending']).nullish(),
  excerpt: z.string().nullish(),
});

export const publishPostResponseSchema = z.object({
  success: z.boolean(),
  postId: z.unknown(), // number from WP REST API
  editUrl: z.string().nullish(),
  viewUrl: z.string().nullish(),
  status: z.string().nullish(),
});

// ── PUT /sites/:id/posts/:postId ─────────────────────────────────────────────

export const updatePostBodySchema = z.object({
  title: z.string(),
  content: z.string(),
  status: z.enum(['draft', 'publish', 'pending']).nullish(),
  excerpt: z.string().nullish(),
});

export const updatePostResponseSchema = z.object({
  success: z.boolean(),
  postId: z.unknown(), // number from WP REST API
  editUrl: z.string().nullish(),
  viewUrl: z.string().nullish(),
  status: z.string().nullish(),
});
