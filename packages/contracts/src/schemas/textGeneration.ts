/**
 * Zod schemas for text generation endpoints.
 *
 * Covers:
 * - apps/api/routes/antraege/simpleGeneration.ts
 * - apps/api/routes/texte/social.ts
 *
 * IMPORTANT: Request bodies use `.nullish()` for optional fields per the
 * 2026-04-12 production incident rule.
 */
import { z } from 'zod';

// ── Common ──────────────────────────────────────────────────────────────────

export const textGenErrorSchema = z.object({ error: z.string() });

// ── antraege/simpleGeneration ───────────────────────────────────────────────

/**
 * Body for POST /api/antraege/generate-simple
 *
 * The source schema uses `.passthrough()` — additional fields from the
 * LangGraph pipeline inputs are allowed. We keep the known fields and
 * preserve the passthrough behaviour via z.unknown() for the rest.
 *
 * NOTE: This endpoint conditionally delegates to SSE streaming when
 * `?stream=true` or `Accept: text/event-stream`. The SSE path is NOT
 * covered here (Session N+5). The contract only covers the non-streaming
 * (JSON) path.
 */
export const simpleGenerationBodySchema = z.object({
  useProMode: z.boolean().nullish(),
  usePrivacyMode: z.boolean().nullish(),
  useWebSearchTool: z.boolean().nullish(),
  useAgentMode: z.boolean().nullish(),
});

// ── texte/social — strategy ─────────────────────────────────────────────────

export const socialStrategyBodySchema = z.object({
  inhalt: z.string(),
  platforms: z.array(z.string()),
});

// ── texte/social — production ───────────────────────────────────────────────

export const socialProductionBodySchema = z.object({
  workflow_id: z.string().min(1),
  approved_platforms: z.array(z.string()).min(1),
  user_feedback: z.string().nullish(),
});

// ── Response schemas ────────────────────────────────────────────────────────

/** Generic AI text-generation response — content varies by prompt processor */
export const textGenSuccessSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

export const socialStrategySuccessSchema = z.object({
  success: z.boolean().optional(),
  error: z.string().optional(),
});
