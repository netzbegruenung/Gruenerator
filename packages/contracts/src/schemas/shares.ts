/**
 * Zod schemas for share endpoints.
 * Mirrors apps/api/routes/share/shareController.ts.
 */
import { z } from 'zod';

// ── Request bodies ──────────────────────────────────────────────────────────

export const createImageShareBodySchema = z.object({
  imageData: z.string(),
  title: z.string().optional(),
  imageType: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  originalImage: z.string().optional(),
  status: z.enum(['ready', 'draft']).optional(),
});

export const createVideoShareBodySchema = z.object({
  exportToken: z.string(),
  title: z.string().optional(),
  projectId: z.string().optional(),
});

export const createVideoFromProjectBodySchema = z.object({
  projectId: z.string(),
  title: z.string().optional(),
});

export const updateImageShareBodySchema = z.object({
  imageBase64: z.string(),
  title: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  originalImage: z.string().optional(),
});

export const saveAsTemplateBodySchema = z.object({
  title: z.string().optional(),
  visibility: z.enum(['private', 'unlisted', 'public']).optional(),
});

export const pushToPhoneBodySchema = z.object({
  shareToken: z.string(),
});

// ── Response sub-schemas ────────────────────────────────────────────────────

export const shareResultSchema = z.object({
  shareToken: z.string(),
  shareUrl: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  mediaType: z.enum(['image', 'video']),
  hasOriginalImage: z.boolean().optional(),
  status: z.string().optional(),
});

// ── Response schemas ────────────────────────────────────────────────────────

export const shareErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
});

export const createShareResponseSchema = z.object({
  success: z.literal(true),
  share: shareResultSchema,
});

export const updateImageShareResponseSchema = z.object({
  success: z.literal(true),
  share: shareResultSchema,
});

export const saveAsTemplateResponseSchema = z.object({
  success: z.literal(true),
  templateUrl: z.string(),
  shareToken: z.string(),
  visibility: z.string(),
});

export const pushToPhoneResponseSchema = z.object({
  success: z.literal(true),
  pushedToDevices: z.number(),
});

// ── Read / management endpoints ─────────────────────────────────────────────

// Query schemas — kept as raw strings; handlers parse exactly like the legacy
// router did (parseInt fallbacks etc.) to preserve behavior.
export const mySharesQuerySchema = z.object({
  type: z.string().optional(),
  status: z.string().optional(),
});

export const recentSharesQuerySchema = z.object({
  limit: z.string().optional(),
});

export const templatesQuerySchema = z.object({
  visibility: z.string().optional(),
});

export const shareListResponseSchema = z.object({
  success: z.literal(true),
  shares: z.array(z.unknown()),
  count: z.number(),
  limit: z.number(),
});

export const shareListSimpleResponseSchema = z.object({
  success: z.literal(true),
  shares: z.array(z.unknown()),
});

export const deleteShareResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export const clonedShareSchema = z.object({
  id: z.string(),
  shareToken: z.string(),
  shareUrl: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  mediaType: z.enum(['image', 'video']),
  hasOriginalImage: z.boolean().optional(),
  status: z.string().optional(),
});

export const cloneTemplateResponseSchema = z.object({
  success: z.literal(true),
  share: clonedShareSchema,
  message: z.string(),
});

export const listTemplatesResponseSchema = z.object({
  success: z.literal(true),
  templates: z.array(z.unknown()),
});

export const getTemplateResponseSchema = z.object({
  success: z.literal(true),
  template: z.unknown(),
});

export const listDevicesResponseSchema = z.object({
  success: z.literal(true),
  devices: z.array(z.unknown()),
});
