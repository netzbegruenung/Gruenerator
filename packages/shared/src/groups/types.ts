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
  created_at?: string;
  created_by?: string;
  join_token?: string;
  links?: GroupLink[] | null;
  settings?: Record<string, unknown> | null;
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

export interface GroupDetail {
  id: string;
  name: string;
  description?: string | null;
  avatar_url?: string | null;
  join_token?: string;
  created_at?: string;
  created_by?: string;
  links?: GroupLink[];
  settings?: Record<string, unknown> | null;
}

export interface GroupMembership {
  role: string;
  joined_at?: string;
  isAdmin: boolean;
}

export interface VerifyTokenResult {
  group: { id: string; name: string };
  alreadyMember: boolean;
}

export const GROUPS_QUERY_KEY = ['userGroups'] as const;
export const groupDetailsKey = (id: string) => ['groupDetails', id] as const;
export const groupMembersKey = (id: string) => ['groupMembers', id] as const;

export const getGroupInitials = (name: string | null | undefined): string => {
  if (!name) return 'G';
  if (!name.includes(' ')) return name.substring(0, 2).toUpperCase();
  const words = name.split(' ');
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
};

export const buildGroupInviteUrl = (joinToken: string): string =>
  `https://gruenerator.eu/join-group/${joinToken}`;
