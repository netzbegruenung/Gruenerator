/**
 * Zod schemas for file transfer endpoints.
 *
 * Covers the non-file-upload routes in:
 * - apps/api/routes/transfer/transferController.ts
 *
 * NOTE: POST /upload uses multer file upload and is SKIPPED per the hard
 * rule on file upload routes.
 *
 * IMPORTANT: Request bodies use `.nullish()` for optional fields per the
 * 2026-04-12 production incident rule.
 */
import { z } from 'zod';

// ── Common ──────────────────────────────────────────────────────────────────

export const transferErrorSchema = z.object({ error: z.string() });

// ── GET /list response ───────────────────────────────────────────────────────

export const transferItemSchema = z.object({
  id: z.string(),
  shareToken: z.string(),
  fileName: z.string().nullable(),
  fileSize: z.number().nullable(),
  mimeType: z.string(),
  downloadCount: z.number(),
  createdAt: z.unknown(),
  expiresAt: z.unknown(),
  isPasswordProtected: z.boolean(),
});

export const transferListResponseSchema = z.object({
  success: z.boolean(),
  transfers: z.array(transferItemSchema),
});

// ── DELETE /:token response ───────────────────────────────────────────────────

export const transferDeleteResponseSchema = z.object({
  success: z.boolean(),
});
