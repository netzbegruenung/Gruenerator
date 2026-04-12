/**
 * Zod schemas for boards endpoints.
 * Mirrors apps/api/routes/boards/boardsController.ts.
 */
import { z } from 'zod';

// ── Request bodies ──────────────────────────────────────────────────────────

export const generateBoardBodySchema = z.object({
  description: z.string(),
});

export const createBoardBodySchema = z.object({
  title: z.string().optional(),
  boardType: z.enum(['kanban', 'whiteboard']).optional(),
});

export const updateBoardBodySchema = z.object({
  title: z.string().optional(),
  is_archived: z.boolean().optional(),
});

// ── Response schemas ────────────────────────────────────────────────────────

export const boardErrorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});

export const boardDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_by: z.string(),
  last_edited_by: z.string(),
  document_subtype: z.string(),
  permissions: z.record(z.object({ level: z.string(), granted_at: z.string() })).nullable(),
  is_public: z.boolean(),
  is_deleted: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  creator_name: z.string().optional(),
});

export const generateBoardResponseSchema = z.object({
  board: boardDocumentSchema,
  generatedStructure: z.unknown().nullable(),
});

export const createBoardResponseSchema = boardDocumentSchema;

export const updateBoardResponseSchema = boardDocumentSchema;
