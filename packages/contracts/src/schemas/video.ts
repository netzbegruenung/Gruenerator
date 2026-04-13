/**
 * Zod schemas for video render endpoints.
 * Mirrors apps/api/routes/video/renderController.ts.
 *
 * IMPORTANT: Request bodies use `.nullish()` for optional fields per the
 * 2026-04-12 production rule.
 */
import { z } from 'zod';

// ── Request bodies ──────────────────────────────────────────────────────────

export const renderBodySchema = z.object({
  design: z.record(z.unknown()),
  options: z
    .object({
      fps: z.number().nullish(),
      size: z.object({ width: z.number(), height: z.number() }).nullish(),
      format: z.string().nullish(),
    })
    .nullish(),
});

// ── Response schemas ────────────────────────────────────────────────────────

export const renderCreateResponseSchema = z.object({
  render: z.object({
    id: z.string(),
  }),
});

export const renderStatusResponseSchema = z.object({
  render: z.object({
    id: z.string(),
    status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']),
    progress: z.number(),
    presigned_url: z.string().nullish(),
    error: z.string().nullish(),
  }),
});

export const renderCancelResponseSchema = z.object({
  success: z.boolean(),
});

export const videoErrorResponseSchema = z.object({
  error: z.string(),
});
