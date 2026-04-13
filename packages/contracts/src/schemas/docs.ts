/**
 * Zod schemas for /api/docs endpoints.
 * Mirrors apps/api/routes/docs/{documentController,permissionsController,shareController,groupShareController}.ts
 *
 * IMPORTANT: Request bodies use `.nullish()` for optional fields per the
 * 2026-04-12 production incident rule. The frontend sends `null` for unset
 * values; plain `.optional()` would 400 every request.
 */
import { z } from 'zod';

// ── Shared error schema ─────────────────────────────────────────────────────

export const docsErrorSchema = z.object({ error: z.string() });

export const docsErrorWithDetailsSchema = z.object({
  error: z.string(),
  details: z.unknown(),
});

// ── documentController schemas ──────────────────────────────────────────────

/**
 * Response schema for GET /api/docs/:id
 * Returns a CollaborativeDocument row — kept as z.unknown() because the DB
 * shape contains arbitrary JSONB `permissions` fields + joined display_name
 * columns and is not yet narrowed to a strict type in the contract layer.
 */
export const collaborativeDocumentSchema = z.unknown();

// ── permissionsController schemas ───────────────────────────────────────────

/**
 * Response for GET /api/docs/:id/permissions
 * Returns a mixed array of user permission entries and group share entries.
 * z.unknown() used because the array entries have discriminated shapes
 * (type:'user' vs type:'group') that would require a z.discriminatedUnion
 * with full DB column coverage — out of scope for this migration batch.
 */
export const permissionsListSchema = z.unknown();

// ── shareController schemas ──────────────────────────────────────────────────

export const shareSettingsSchema = z.object({
  is_public: z.boolean(),
  share_permission: z.string(),
  share_mode: z.string(),
});

// ── groupShareController schemas ─────────────────────────────────────────────

export const addGroupBodySchema = z.object({
  group_id: z.string(),
  permission_level: z.enum(['viewer', 'editor']).nullish(),
});

export const updateGroupBodySchema = z.object({
  permission_level: z.enum(['viewer', 'editor']),
});
