import { type GroupDetailDto, type GroupEmailNotifications } from '@gruenerator/contracts';

import { PRODUCTION_WEB_ORIGIN } from '../instances/index.js';
import { buildGroupSlug } from '../utils/slug.js';
import { rankByUsage, type UsageMap } from '../utils/usageRanking.js';

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

export type AllowedLinkIcon = (typeof ALLOWED_LINK_ICONS)[number];

export interface GroupLink {
  id: string;
  title: string;
  url: string;
  description?: string;
  icon: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  description?: string | null;
  avatar_url?: string | null;
  member_count?: number;
  content_count?: number;
  role: string;
  isAdmin?: boolean;
  /** F0 stored value; the UI no longer branches on it (one kind of project, behaviour follows membership). */
  group_type?: 'standard' | 'personal' | null;
  /** The one group every user belongs to: no member info, only instance admins share. */
  is_system?: boolean | null;
  created_at?: string;
  created_by?: string;
  join_token?: string;
  links?: GroupLink[] | null;
  settings?: Record<string, unknown> | null;
  /** Stable 6-char tail for the Notion-style URL `/gruppen/<name>-<suffix>`. */
  slug_suffix?: string | null;
  /** ISO time an admin archived the project; null/absent = active. */
  archived_at?: string | null;
  /** Optional tile colour (key of the fixed palette); null/absent = default. */
  color?: string | null;
  /** ISO time of the latest post, share, comment or chat in the project (server-computed). */
  last_activity_at?: string | null;
  [key: string]: unknown;
}

export interface GroupMember {
  user_id: string;
  role: string;
  joined_at?: string;
  display_name?: string | null;
  first_name?: string | null;
  email?: string | null;
  avatar_robot_id?: number | null;
  [key: string]: unknown;
}

/**
 * One group as `GET /api/auth/groups/:groupId/details` returns it. Derived from
 * `groupDetailSchema` rather than hand-written: the copy that used to live here
 * silently lacked `is_public`, `audience` and `group_type`, so every consumer
 * that needed them had to cast the shape away.
 */
export type GroupDetail = GroupDetailDto;

export interface GroupMembership {
  role: string;
  joined_at?: string;
  isAdmin: boolean;
  /** Which of this project's notifications reach the caller by email. */
  email_notifications?: GroupEmailNotifications | null;
}

export interface VerifyTokenResult {
  group: { id: string; name: string };
  alreadyMember: boolean;
}

export const GROUPS_QUERY_KEY = ['userGroups'] as const;
export const groupDetailsKey = (id: string) => ['groupDetails', id] as const;
export const groupInstructionsKey = (id: string) => ['groupInstructions', id] as const;
export const groupMembersKey = (id: string) => ['groupMembers', id] as const;
/** Web (`useGroupSharing`) und App (`useGroupContent`) teilen diesen Schlüssel. */
export const groupContentKey = (id: string) => ['groupContent', id] as const;
export const groupShareCommentsKey = (groupId: string, shareId: string) =>
  ['groupShareComments', groupId, shareId] as const;

export const getGroupInitials = (name: string | null | undefined): string => {
  if (!name) return 'G';
  if (!name.includes(' ')) return name.substring(0, 2).toUpperCase();
  const words = name.split(' ');
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
};

/** Whether the user may share into (or file chats into) this group — mirrors the server gate. */
export const canShareIntoGroup = (group: {
  is_system?: boolean | null;
  isAdmin?: boolean | null;
  archived_at?: string | null;
}): boolean => (!group.is_system || !!group.isAdmin) && !group.archived_at;

/** Archived projects leave the main lists, stay readable and take no new content. */
export const isGroupArchived = (group: { archived_at?: string | null }): boolean =>
  !!group.archived_at;

/** Splits a project list into the active ones and the archived ones, keeping order. */
export const splitArchivedGroups = <T extends { archived_at?: string | null }>(
  groups: readonly T[]
): { active: T[]; archived: T[] } => ({
  active: groups.filter((g) => !isGroupArchived(g)),
  archived: groups.filter(isGroupArchived),
});

export type GroupSort = 'recommended' | 'activity' | 'name' | 'newest';

const timeOf = (value: string | null | undefined): number => {
  const t = value ? Date.parse(value) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

const byActivity = (
  a: { created_at?: string; last_activity_at?: string | null },
  b: { created_at?: string; last_activity_at?: string | null }
): number =>
  timeOf(b.last_activity_at ?? b.created_at) - timeOf(a.last_activity_at ?? a.created_at);

/**
 * Sorts a project list without mutating it: by usage ('recommended', falling back to
 * last activity for never-used projects), last activity, name (de) or creation date,
 * newest first. Without a usage map 'recommended' is plain activity order.
 */
export const sortGroups = <
  T extends { id: string; name: string; created_at?: string; last_activity_at?: string | null },
>(
  groups: readonly T[],
  sort: GroupSort,
  usage: UsageMap = {}
): T[] =>
  sort === 'recommended'
    ? rankByUsage(groups, (g) => g.id, usage, byActivity)
    : [...groups].sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });
        if (sort === 'newest') return timeOf(b.created_at) - timeOf(a.created_at);
        return byActivity(a, b);
      });

/**
 * Wer eine Freigabe verwalten (Rolle ändern, entfernen) darf — dieselbe Regel wie auf dem
 * Server (`updateContentPermissions`, `removeGroupContent`): Admin oder die Person, die geteilt hat.
 */
export const canManageShare = (
  item: { sharedById: string | null },
  isAdmin: boolean | null | undefined,
  currentUserId: string | number | null | undefined
): boolean =>
  !!isAdmin ||
  (currentUserId !== null &&
    currentUserId !== undefined &&
    currentUserId !== '' &&
    item.sharedById !== null &&
    item.sharedById === String(currentUserId));

export const buildGroupInviteUrl = (joinToken: string): string =>
  `${PRODUCTION_WEB_ORIGIN}/join-group/${joinToken}`;

/**
 * Path to a group's page. Uses the Notion-style slug when the suffix is known,
 * falling back to the raw UUID (still resolved by the backend) for legacy or
 * not-yet-backfilled groups. Canonical path is `/projekte/*` (formerly
 * `/gruppen/*`, which still redirects here).
 */
export const buildGroupPath = (group: {
  id: string;
  name: string;
  slug_suffix?: string | null;
}): string =>
  `/projekte/${group.slug_suffix ? buildGroupSlug(group.name, group.slug_suffix) : group.id}`;
