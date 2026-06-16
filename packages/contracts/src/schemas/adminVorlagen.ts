/**
 * Zod schemas for admin Vorlagen (template review) endpoints.
 * Mirrors apps/api/routes/auth/templates/adminTemplates.ts.
 */
import { z } from 'zod';

// ── Sub-schemas ──────────────────────────────────────────────────────────────

export const adminVorlageSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  template_type: z.string(),
  thumbnail_url: z.string().nullable(),
  external_url: z.string().nullable(),
  images: z.array(z.unknown()),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  content_data: z.record(z.unknown()),
  metadata: z.record(z.unknown()),
  is_private: z.boolean(),
  status: z.string(),
  creator_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const vorlagenStatsSchema = z.object({
  pending: z.number(),
  published: z.number(),
  rejected: z.number(),
});

// ── Request bodies ───────────────────────────────────────────────────────────

export const approveVorlageBodySchema = z.object({
  message: z.string().nullish(),
});

export const rejectVorlageBodySchema = z.object({
  reason: z.string().nullish(),
});

// ── Response schemas ─────────────────────────────────────────────────────────

export const adminVorlagenListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(adminVorlageSchema),
});

export const adminVorlagenStatsResponseSchema = z.object({
  success: z.boolean(),
  data: vorlagenStatsSchema,
});

export const adminVorlagenSuccessResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const adminVorlagenErrorResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
