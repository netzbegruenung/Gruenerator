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

// ── Core group CRUD / membership (migrated from the legacy raw routes) ─────────
//
// Date fields are wire strings (ISO). The server normalizes the pg `Date`
// objects via `toISOString()` before returning so the handler return types
// match these schemas.

export const groupSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  created_at: z.string().nullish(),
  created_by: z.string().nullish(),
  join_token: z.string().nullish(),
  settings: z.record(z.unknown()).nullish(),
  avatar_url: z.string().nullish(),
  links: z.array(groupLinkSchema).nullish(),
  role: z.string(),
  joined_at: z.string().nullish(),
  isAdmin: z.boolean(),
  member_count: z.number().nullish(),
  content_count: z.number().nullish(),
  // Stable 6-char tail for the Notion-style URL `/gruppen/<name>-<suffix>`.
  slug_suffix: z.string().nullish(),
});
export type GroupSummaryDto = z.infer<typeof groupSummarySchema>;

export const groupDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  created_at: z.string().nullish(),
  created_by: z.string().nullish(),
  join_token: z.string().nullish(),
  settings: z.record(z.unknown()).nullish(),
  avatar_url: z.string().nullish(),
  links: z.array(groupLinkSchema).nullish(),
  is_public: z.boolean().nullish(),
  audience: groupAudienceSchema.nullish(),
  // Stable 6-char tail for the Notion-style URL `/gruppen/<name>-<suffix>`.
  slug_suffix: z.string().nullish(),
});
export type GroupDetailDto = z.infer<typeof groupDetailSchema>;

export const groupMembershipSchema = z.object({
  role: z.string(),
  joined_at: z.string().nullish(),
  isAdmin: z.boolean(),
});
export type GroupMembershipDto = z.infer<typeof groupMembershipSchema>;

export const groupMemberSchema = z.object({
  user_id: z.string(),
  role: z.string(),
  joined_at: z.string().nullish(),
  first_name: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_robot_id: z.number().nullish(),
});
export type GroupMemberDto = z.infer<typeof groupMemberSchema>;

export const groupTokenRefSchema = z.object({ id: z.string(), name: z.string() });

// ── Request bodies ─────────────────────────────────────────────────────────────

export const createGroupBodySchema = z.object({
  name: z.string().min(1, 'Gruppenname ist erforderlich.'),
  description: z.string().nullish(),
});
export type CreateGroupBody = z.infer<typeof createGroupBodySchema>;

export const updateGroupInfoBodySchema = z.object({
  name: z.string().nullish(),
  description: z.string().nullish(),
  // Free-form group settings (e.g. `templateTags`). Kept as a generic record so
  // the typed client accepts the frontend's `Record<string, unknown>` value.
  settings: z.record(z.unknown()).nullish(),
});
export type UpdateGroupInfoBody = z.infer<typeof updateGroupInfoBodySchema>;

export const updateGroupNameBodySchema = z.object({
  name: z.string().nullish(),
});
export type UpdateGroupNameBody = z.infer<typeof updateGroupNameBodySchema>;

export const joinByTokenBodySchema = z.object({
  joinToken: z.string().min(1, 'Beitritts-Token ist erforderlich.'),
});
export type JoinByTokenBody = z.infer<typeof joinByTokenBodySchema>;

export const memberRoleBodySchema = z.object({
  role: groupRoleSchema,
});
export type MemberRoleBody = z.infer<typeof memberRoleBodySchema>;

export const groupLinkBodySchema = z.object({
  title: z
    .string()
    .min(1, 'Titel ist erforderlich.')
    .max(100, 'Titel darf max. 100 Zeichen haben.'),
  url: z.string().regex(/^https?:\/\/.+/, 'URL muss mit http:// oder https:// beginnen.'),
  // The UI icon picker constrains this to ALLOWED_LINK_ICONS; the frontend
  // type is `string`, so the wire contract stays `string` to avoid casts.
  icon: z.string(),
  description: z.string().max(300, 'Beschreibung darf max. 300 Zeichen haben.').nullish(),
});
export type GroupLinkBody = z.infer<typeof groupLinkBodySchema>;

// ── Wrapper response shapes (mirror the legacy `{ success, ... }` envelopes) ───

export const listUserGroupsResponseSchema = z.object({
  success: z.literal(true),
  groups: z.array(groupSummarySchema),
});

export const groupCreateResponseSchema = z.object({
  success: z.literal(true),
  group: groupSummarySchema,
});

export const groupDetailsResponseSchema = z.object({
  success: z.literal(true),
  group: groupDetailSchema,
  membership: groupMembershipSchema,
});

/** Maps a pretty slug or raw UUID to the group's canonical id. */
export const groupResolveResponseSchema = z.object({
  success: z.literal(true),
  id: z.string(),
});

export const groupMembersResponseSchema = z.object({
  success: z.literal(true),
  members: z.array(groupMemberSchema),
});

export const verifyTokenResponseSchema = z.object({
  success: z.literal(true),
  group: groupTokenRefSchema,
  alreadyMember: z.boolean(),
});

export const joinGroupResponseSchema = z.object({
  success: z.literal(true),
  group: groupTokenRefSchema,
  alreadyMember: z.boolean().nullish(),
  message: z.string().nullish(),
});

export const groupLinkResponseSchema = z.object({
  success: z.literal(true),
  link: groupLinkSchema,
});

export const groupOkResponseSchema = z.object({
  success: z.literal(true),
});
