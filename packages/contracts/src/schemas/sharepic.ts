/**
 * Zod schemas for sharepic canvas endpoints.
 *
 * Covers:
 * - apps/api/routes/sharepic/sharepic_canvas/campaign_canvas.ts
 *
 * IMPORTANT: Request bodies use `.nullish()` for optional fields per the
 * 2026-04-12 production incident rule.
 */
import { z } from 'zod';

import { canvasTemplateTypeSchema } from './canvasTemplateDescriptors.js';

// ── Chat → Studio handoff ───────────────────────────────────────────────────

/**
 * Ephemeral localStorage payload for opening an UNMINTED chat sharepic
 * variant in the studio (`/studio/templates/:type?handoff=<id>`). Written by
 * the chat host (GlobalChatProvider.onEditSharepic), read once and deleted
 * by ImageStudioPage. Contract-based on both sides: the writer constructs it
 * as this type (compile error on a non-canonical canvasType), the reader
 * `safeParse`s it so a malformed/stale payload can never advance the studio
 * wizard to the canvas mint.
 */
export const sharepicHandoffPayloadSchema = z.object({
  canvasType: canvasTemplateTypeSchema,
  initialProps: z.record(z.string(), z.unknown()),
  /** Write timestamp (ms) — the reader rejects payloads older than 5 min. */
  ts: z.number(),
});
export type SharepicHandoffPayload = z.infer<typeof sharepicHandoffPayloadSchema>;

// ── Request bodies ──────────────────────────────────────────────────────────

/**
 * POST /api/campaign_canvas
 *
 * Renders a campaign sharepic from a config + text data.
 * `campaignConfig` is a free-form record since the shape is loaded from
 * JSON campaign config files at runtime.
 */
export const campaignCanvasBodySchema = z.object({
  campaignConfig: z.record(z.string(), z.unknown()).nullish(),
  textData: z.record(z.string(), z.string().nullish()).nullish(),
  campaignId: z.string().nullish(),
  campaignTypeId: z.string().nullish(),
  line1: z.string().nullish(),
  line2: z.string().nullish(),
  line3: z.string().nullish(),
  line4: z.string().nullish(),
  line5: z.string().nullish(),
  location: z.string().nullish(),
  thema: z.string().nullish(),
  customCredit: z.string().nullable().nullish(),
});

// ── Response schemas ────────────────────────────────────────────────────────

export const campaignCanvasErrorSchema = z.object({
  success: z.boolean(),
  error: z.string(),
});

export const campaignCanvasSuccessSchema = z.object({
  success: z.boolean(),
  /** Base64-encoded PNG image */
  image: z.string(),
  creditText: z.string(),
});
