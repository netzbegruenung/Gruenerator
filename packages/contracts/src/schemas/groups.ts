/**
 * Zod schemas for public-group discovery and admin-moderated join requests.
 *
 * Single source of truth for the closed sets shared across the stack:
 *   - group role      (admin | member)
 *   - group audience  (de-DE | de-AT | all)  — Austria is a first-class locale
 *   - join request status (pending | approved | denied)
 *
 * The Drizzle schema (apps/api/database/schema/groups.ts) imports the inferred
 * types from here so the DB row types stay narrowed to these unions.
 */
import { z } from 'zod';

// ── Closed sets ───────────────────────────────────────────────────────────────

export const groupRoleSchema = z.enum(['admin', 'member']);
export type GroupRole = z.infer<typeof groupRoleSchema>;

export const groupAudienceSchema = z.enum(['de-DE', 'de-AT', 'all']);
export type GroupAudience = z.infer<typeof groupAudienceSchema>;

export const joinRequestStatusSchema = z.enum(['pending', 'approved', 'denied']);
export type JoinRequestStatus = z.infer<typeof joinRequestStatusSchema>;

export const ALLOWED_LINK_ICONS = [
  'globe',
  'link',
  'mail',
  'calendar',
  'chat',
  'folder',
  'phone',
  'video',
  'document',
  'map',
  'signal',
  'whatsapp',
  'telegram',
  'discord',
  'slack',
  'mattermost',
  'canva',
  'figma',
  'miro',
  'drive',
  'nextcloud',
  'notion',
  'trello',
  'github',
  'zoom',
  'googlemeet',
  'youtube',
  'instagram',
  'mastodon',
  'linkedin',
  'x',
] as const;
export const groupLinkIconSchema = z.enum(ALLOWED_LINK_ICONS);

export const groupLinkSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  description: z.string().nullish(),
  icon: z.string(),
});
export type GroupLink = z.infer<typeof groupLinkSchema>;

// ── Response shapes ────────────────────────────────────────────────────────────

/**
 * A discoverable public group as shown on the /gruppen "Öffentliche Gruppen"
 * section. `request_status` is the calling user's current request state for
 * this group (null = never requested / can request).
 */
export const publicGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  avatar_url: z.string().nullable(),
  member_count: z.number(),
  audience: groupAudienceSchema,
  request_status: joinRequestStatusSchema.nullable(),
});
export type PublicGroup = z.infer<typeof publicGroupSchema>;

export const discoverGroupsResponseSchema = z.array(publicGroupSchema);

/** A pending join request with the requester's profile fields joined in. */
export const joinRequestSchema = z.object({
  id: z.string(),
  group_id: z.string(),
  user_id: z.string(),
  status: joinRequestStatusSchema,
  requested_at: z.string(),
  display_name: z.string().nullable(),
  first_name: z.string().nullable(),
  email: z.string().nullable(),
  avatar_robot_id: z.number().nullable(),
});
export type JoinRequest = z.infer<typeof joinRequestSchema>;

export const joinRequestsResponseSchema = z.array(joinRequestSchema);

export const requestToJoinResponseSchema = z.object({
  success: z.literal(true),
  status: joinRequestStatusSchema,
});

export const groupVisibilityResponseSchema = z.object({
  success: z.literal(true),
  is_public: z.boolean(),
  audience: groupAudienceSchema,
});

export const groupSuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export const groupErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});
export type GroupErrorResponse = z.infer<typeof groupErrorResponseSchema>;

// ── Request bodies ─────────────────────────────────────────────────────────────

export const setGroupVisibilityBodySchema = z.object({
  is_public: z.boolean(),
  audience: groupAudienceSchema,
});
export type SetGroupVisibilityBody = z.infer<typeof setGroupVisibilityBodySchema>;
