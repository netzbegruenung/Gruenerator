import { FileText, LayoutDashboard, MessageSquare, Share2, Users } from 'lucide-react';

import { openLinkAction, type NotificationTypeConfig } from '../notificationConfig';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  action_url: string | null;
  group_key: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export type NotificationGroup = 'documents' | 'board' | 'groups' | 'system';

export const NOTIFICATION_GROUPS: Record<NotificationGroup, { label: string; order: number }> = {
  documents: { label: 'Dokumente', order: 0 },
  board: { label: 'Board', order: 1 },
  groups: { label: 'Gruppen', order: 2 },
  system: { label: 'System', order: 3 },
};

export const NOTIFICATION_TYPES: Record<string, NotificationTypeConfig> = {
  document_shared: {
    label: 'Dokumente',
    description: 'Geteilte Dokumente, Berechtigungs- und Zugriffsänderungen',
    icon: FileText,
    group: 'documents',
    subtypes: ['document_shared', 'document_permission_changed', 'document_access_revoked'],
    actions: (ctx) => [openLinkAction('Dokument öffnen')(ctx)],
  },

  board_updates: {
    label: 'Board-Aufgaben',
    description: 'Wenn es Updates zu deinen Aufgaben gibt',
    icon: LayoutDashboard,
    group: 'board',
    actions: (ctx) => [openLinkAction('Board öffnen')(ctx)],
  },
  board_comment_added: {
    label: 'Board-Kommentare & Erwähnungen',
    description: 'Neue Kommentare, Antworten und @-Erwähnungen',
    icon: MessageSquare,
    group: 'board',
    subtypes: ['board_comment_added', 'board_comment_reply', 'board_user_mentioned'],
    actions: (ctx) => [openLinkAction('Karte öffnen')(ctx)],
  },

  group_member_joined: {
    label: 'Mitglieder & Rollen',
    description: 'Wenn Mitglieder beitreten, austreten oder Rollen sich ändern',
    icon: Users,
    group: 'groups',
    subtypes: ['group_member_joined', 'group_member_left', 'group_role_changed'],
    actions: (ctx) => [openLinkAction('Gruppe öffnen')(ctx)],
  },
  group_content_shared: {
    label: 'Geteilte Inhalte',
    description: 'Wenn Inhalte in deiner Gruppe geteilt werden',
    icon: Share2,
    group: 'groups',
    actions: (ctx) => [openLinkAction('Gruppe öffnen')(ctx)],
  },
  group_deleted: {
    label: 'Gruppe aufgelöst',
    description: 'Wenn eine Gruppe aufgelöst wird',
    icon: Users,
    group: 'groups',
  },

  // transfer_downloaded: {
  //   label: 'Transfer-Download',
  //   description: 'Wenn jemand deine geteilte Datei herunterlädt',
  //   icon: Download,
  //   group: 'system',
  // },
};
