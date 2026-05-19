/**
 * Zod schemas for notebook-collection sharing endpoints.
 *
 * The notebook share model has two independent axes:
 *   - share_mode    : who can READ the notebook (private | groups | authenticated)
 *   - edit_policy   : who can WRITE non-visibility content (owner_only | group_admins | all_members)
 * Group shares live in the polymorphic `group_content_shares` table with
 * `content_type='notebook_collections'`. There is no per-user grant for notebooks.
 */
import { z } from 'zod';

import {
  notebookAudienceSchema,
  notebookEditPolicySchema,
  notebookShareModeSchema,
  publicOwnershipSchema,
} from './notebookCollections.js';

// ── Settings shape ──────────────────────────────────────────────────────────

export const notebookShareSettingsSchema = z.object({
  share_mode: notebookShareModeSchema,
  edit_policy: notebookEditPolicySchema,
  audience: notebookAudienceSchema,
  is_public: z.boolean(),
  public_ownership: publicOwnershipSchema.nullable(),
});
export type NotebookShareSettings = z.infer<typeof notebookShareSettingsSchema>;

// ── Request bodies ──────────────────────────────────────────────────────────

export const notebookShareModeBodySchema = z.object({
  mode: notebookShareModeSchema,
});

export const notebookEditPolicyBodySchema = z.object({
  policy: notebookEditPolicySchema,
});

export const notebookAudienceBodySchema = z.object({
  audience: notebookAudienceSchema,
});

/**
 * Toggle Von-der-Basis discovery on top of `share_mode='authenticated'`.
 * `public_ownership` MUST be non-null when `is_public=true` (legal
 * attestation for community listing). When `is_public=false`, ownership is
 * cleared server-side regardless of what's sent.
 */
export const notebookIsPublicBodySchema = z.object({
  is_public: z.boolean(),
  public_ownership: publicOwnershipSchema.nullable(),
});

export const notebookAddGroupShareBodySchema = z.object({
  group_id: z.string(),
});

// ── Response shapes ─────────────────────────────────────────────────────────

export const notebookGroupShareSchema = z.object({
  group_id: z.string(),
  group_name: z.string(),
  shared_at: z.string(),
});
export type NotebookGroupShare = z.infer<typeof notebookGroupShareSchema>;

export const notebookGroupSharesResponseSchema = z.array(notebookGroupShareSchema);

export const notebookUserGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
});
export type NotebookUserGroup = z.infer<typeof notebookUserGroupSchema>;

export const notebookUserGroupsResponseSchema = z.array(notebookUserGroupSchema);

export const notebookSimpleSuccessSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export const notebookShareErrorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});
