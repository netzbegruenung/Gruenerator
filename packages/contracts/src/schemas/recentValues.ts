/**
 * Zod schemas for recent-values endpoints.
 * Mirrors apps/api/routes/user/recentValuesController.ts.
 */
import { z } from 'zod';

// ── Shared sub-schemas ──────────────────────────────────────────────────────

export const recentValueItemSchema = z.object({
  id: z.string(),
  field_type: z.string(),
  field_value: z.string(),
  form_name: z.string().nullable(),
  // Date serialises to an ISO string over JSON
  created_at: z.union([z.string(), z.date()]),
});

export const fieldTypeCountSchema = z.object({
  field_type: z.string(),
  // FieldTypeWithCount from RecentValuesService uses `value_count`
  value_count: z.number(),
  last_used: z.union([z.string(), z.date()]),
});

// ── Request bodies ──────────────────────────────────────────────────────────

export const saveRecentValueBodySchema = z.object({
  fieldType: z.string(),
  fieldValue: z.string(),
  formName: z.string().optional(),
});

// ── Response schemas ────────────────────────────────────────────────────────

export const saveRecentValueResponseSchema = z.object({
  success: z.literal(true),
  data: recentValueItemSchema,
  message: z.string(),
});

export const getRecentValuesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(recentValueItemSchema),
  fieldType: z.string(),
  count: z.number(),
});

export const clearRecentValuesResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  deletedCount: z.number(),
});

export const getFieldTypesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(fieldTypeCountSchema),
  count: z.number(),
});

export const recentValueErrorResponseSchema = z.object({
  error: z.string(),
});
