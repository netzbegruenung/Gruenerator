/**
 * Zod schemas for user-agent (Agentura) sharing endpoints.
 *
 * The agent share model has a single visibility axis plus a public-listing
 * toggle:
 *   - share_mode : who can SEE/USE the agent (private | groups | authenticated)
 *   - is_public  : list the agent in the public Agentura directory, on top of
 *                  share_mode='authenticated' (the agent equivalent of the
 *                  notebooks' "Von der Basis" discovery listing).
 * Group shares live in the polymorphic `group_content_shares` table with
 * `content_type='user_agents'`. Agents are USED, not co-edited — there is no
 * per-user grant and no edit_policy. The agent's `locale` doubles as the
 * audience filter for the authenticated listing.
 */
import { z } from 'zod';

import { notebookAudienceSchema, publicOwnershipSchema } from './notebookCollections.js';
import { userAgentSchema } from './userAgents.js';

// ── Closed sets ──────────────────────────────────────────────────────────────

export const userAgentShareModeSchema = z.enum(['private', 'groups', 'authenticated']);
export type UserAgentShareMode = z.infer<typeof userAgentShareModeSchema>;

// ── Settings shape ──────────────────────────────────────────────────────────

export const userAgentShareSettingsSchema = z.object({
  share_mode: userAgentShareModeSchema,
  audience: notebookAudienceSchema,
  is_public: z.boolean(),
  public_ownership: publicOwnershipSchema.nullable(),
});
export type UserAgentShareSettings = z.infer<typeof userAgentShareSettingsSchema>;

// ── Request bodies ──────────────────────────────────────────────────────────

export const userAgentShareModeBodySchema = z.object({
  mode: userAgentShareModeSchema,
});

export const userAgentAudienceBodySchema = z.object({
  audience: notebookAudienceSchema,
});

/**
 * Toggle Agentura discovery on top of `share_mode='authenticated'`.
 * `public_ownership` MUST be non-null when `is_public=true` (legal attestation
 * for community listing). When `is_public=false`, ownership is cleared
 * server-side regardless of what's sent.
 */
export const userAgentIsPublicBodySchema = z.object({
  is_public: z.boolean(),
  public_ownership: publicOwnershipSchema.nullable(),
});

export const userAgentAddGroupShareBodySchema = z.object({
  group_id: z.string(),
});

// ── Response shapes ─────────────────────────────────────────────────────────

export const userAgentGroupShareSchema = z.object({
  group_id: z.string(),
  group_name: z.string(),
  shared_at: z.string(),
});
export type UserAgentGroupShare = z.infer<typeof userAgentGroupShareSchema>;

export const userAgentGroupSharesResponseSchema = z.array(userAgentGroupShareSchema);

export const userAgentUserGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
});
export type UserAgentUserGroup = z.infer<typeof userAgentUserGroupSchema>;

export const userAgentUserGroupsResponseSchema = z.array(userAgentUserGroupSchema);

/** Public Agentura discovery feed — full agent shapes. */
export const publicUserAgentsResponseSchema = z.object({
  success: z.boolean(),
  agents: z.array(userAgentSchema),
});

export const userAgentShareSimpleSuccessSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export const userAgentShareErrorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});
