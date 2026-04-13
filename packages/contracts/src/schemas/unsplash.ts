/**
 * Zod schemas for Unsplash image API proxy endpoints.
 *
 * Covers:
 * - apps/api/routes/unsplash/unsplashRoutes.ts
 *
 * The search response shape matches the external Unsplash API response.
 * z.unknown() is used for the 200 body — external: Unsplash REST API
 * photo search response.
 *
 * IMPORTANT: Request bodies use `.nullish()` for optional fields per the
 * 2026-04-12 production incident rule.
 */
import { z } from 'zod';

// ── GET /search ──────────────────────────────────────────────────────────────

export const unsplashSearchQuerySchema = z.object({
  query: z.string().min(1),
  page: z.string().nullish(),
  per_page: z.string().nullish(),
});

// external: Unsplash REST API photo search response
export const unsplashSearchResponseSchema = z.unknown();

// ── POST /track-download ─────────────────────────────────────────────────────

export const trackDownloadBodySchema = z.object({
  downloadLocation: z.string().min(1),
});

export const trackDownloadResponseSchema = z.object({
  success: z.boolean(),
  warning: z.string().optional(),
});

// ── Error schemas ────────────────────────────────────────────────────────────

export const unsplashErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export const unsplashRateLimitErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  retryAfter: z.number(),
});
