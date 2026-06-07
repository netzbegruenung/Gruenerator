/**
 * Per-RAW-type metadata for the notification preferences UI.
 *
 * Unlike NOTIFICATION_TYPES (notificationConfig.ts), which merges several raw
 * types into a single bell/toggle, this map lists every one of the 18 raw
 * notification types individually. The expert ("Erweiterte Einstellungen")
 * table needs per-raw-type rows because the importance tiers split merged
 * subtypes (e.g. board_user_mentioned is critical, board_comment_added is not),
 * so a merged toggle would misrepresent the per-channel state.
 *
 * The importance tiering itself is the backend's single source of truth
 * (apps/api/services/notifications/notificationPreferences.ts). This file is
 * display-only.
 */
import {
  AtSign,
  Bell,
  BellOff,
  BellRing,
  CloudDownload,
  FileText,
  Heart,
  LayoutDashboard,
  MessageSquare,
  Share2,
  UserPlus,
  Users,
} from 'lucide-react';

import { NOTIFICATION_GROUPS, type NotificationGroup } from './types';

import type { NotificationType } from '@gruenerator/contracts';
import type { ComponentType } from 'react';

export interface RawTypeMeta {
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  group: NotificationGroup;
}

export const RAW_TYPE_META: Record<NotificationType, RawTypeMeta> = {
  // Dokumente
  document_shared: {
    label: 'Dokument geteilt',
    description: 'Wenn ein Dokument mit dir geteilt wird',
    icon: FileText,
    group: 'documents',
  },
  document_permission_changed: {
    label: 'Berechtigung geändert',
    description: 'Wenn deine Berechtigung an einem Dokument geändert wird',
    icon: FileText,
    group: 'documents',
  },
  document_access_revoked: {
    label: 'Zugriff entzogen',
    description: 'Wenn dein Zugriff auf ein Dokument entzogen wird',
    icon: FileText,
    group: 'documents',
  },

  // Board
  board_updates: {
    label: 'Aufgaben-Updates',
    description: 'Updates zu deinen Board-Aufgaben',
    icon: LayoutDashboard,
    group: 'board',
  },
  board_comment_added: {
    label: 'Neue Kommentare',
    description: 'Neue Kommentare auf Karten',
    icon: MessageSquare,
    group: 'board',
  },
  board_comment_reply: {
    label: 'Antworten',
    description: 'Antworten auf deine Kommentare',
    icon: MessageSquare,
    group: 'board',
  },
  board_user_mentioned: {
    label: 'Erwähnungen',
    description: 'Wenn du in einem Kommentar erwähnt wirst',
    icon: AtSign,
    group: 'board',
  },

  // Gruppen
  group_member_joined: {
    label: 'Mitglied tritt bei',
    description: 'Wenn ein Mitglied einer deiner Gruppen beitritt',
    icon: Users,
    group: 'groups',
  },
  group_member_left: {
    label: 'Mitglied tritt aus',
    description: 'Wenn ein Mitglied eine deiner Gruppen verlässt',
    icon: Users,
    group: 'groups',
  },
  group_role_changed: {
    label: 'Rollenänderung',
    description: 'Wenn sich eine Rolle in der Gruppe ändert',
    icon: Users,
    group: 'groups',
  },
  group_content_shared: {
    label: 'Geteilte Inhalte',
    description: 'Wenn Inhalte in einer deiner Gruppen geteilt werden',
    icon: Share2,
    group: 'groups',
  },
  group_deleted: {
    label: 'Gruppe aufgelöst',
    description: 'Wenn eine deiner Gruppen aufgelöst wird',
    icon: Users,
    group: 'groups',
  },
  group_join_requested: {
    label: 'Beitrittsanfragen',
    description: 'Wenn jemand deiner öffentlichen Gruppe beitreten möchte',
    icon: UserPlus,
    group: 'groups',
  },
  group_join_approved: {
    label: 'Beitritt angenommen',
    description: 'Wenn deine Beitrittsanfrage angenommen wird',
    icon: UserPlus,
    group: 'groups',
  },
  group_join_denied: {
    label: 'Beitritt abgelehnt',
    description: 'Wenn deine Beitrittsanfrage abgelehnt wird',
    icon: UserPlus,
    group: 'groups',
  },

  // System
  transfer_downloaded: {
    label: 'Transfer-Download',
    description: 'Wenn jemand deine geteilte Datei herunterlädt',
    icon: CloudDownload,
    group: 'system',
  },
  notebook_liked: {
    label: 'Notizbuch-Likes',
    description: 'Wenn jemand dein öffentliches Notizbuch mag',
    icon: Heart,
    group: 'system',
  },
  wolke_new_files: {
    label: 'Neue Wolke-Dateien',
    description: 'Neue Dateien in den Wolke-Ordnern deiner Notizbücher',
    icon: CloudDownload,
    group: 'system',
  },
};

/** Raw types grouped by category, in group order, for the expert table. */
export function getRawTypesByGroup(): { group: NotificationGroup; label: string; types: NotificationType[] }[] {
  const byGroup = new Map<NotificationGroup, NotificationType[]>();
  for (const [type, meta] of Object.entries(RAW_TYPE_META) as [NotificationType, RawTypeMeta][]) {
    const existing = byGroup.get(meta.group) ?? [];
    existing.push(type);
    byGroup.set(meta.group, existing);
  }
  return (Object.keys(NOTIFICATION_GROUPS) as NotificationGroup[])
    .sort((a, b) => NOTIFICATION_GROUPS[a].order - NOTIFICATION_GROUPS[b].order)
    .map((group) => ({ group, label: NOTIFICATION_GROUPS[group].label, types: byGroup.get(group) ?? [] }))
    .filter((g) => g.types.length > 0);
}

export interface LevelOption {
  value: 'low' | 'medium' | 'high';
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

export const LEVEL_OPTIONS: LevelOption[] = [
  {
    value: 'low',
    label: 'Wenig',
    description: 'Nur kritische & persönliche Benachrichtigungen',
    icon: BellOff,
  },
  {
    value: 'medium',
    label: 'Mittel',
    description: 'Empfohlen – wichtige Ereignisse',
    icon: Bell,
  },
  {
    value: 'high',
    label: 'Viele',
    description: 'Alle Benachrichtigungen',
    icon: BellRing,
  },
];
