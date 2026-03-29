import {
  AtSign,
  Download,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Reply,
  Share2,
  Shield,
  UserPlus,
  Users,
} from 'lucide-react';

import { openLinkAction, type NotificationTypeConfig } from '../notificationConfig';

import wolkeSetup from './wolkeSetup';

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
    label: 'Geteilte Dokumente',
    description: 'Wenn ein Dokument mit dir geteilt wird',
    icon: FileText,
    group: 'documents',
    actions: (ctx) => [openLinkAction('Dokument öffnen')(ctx)],
  },
  document_permission_changed: {
    label: 'Berechtigungsänderungen',
    description: 'Wenn deine Dokument-Berechtigung geändert wird',
    icon: FileText,
    group: 'documents',
    actions: (ctx) => [openLinkAction('Dokument öffnen')(ctx)],
  },
  document_access_revoked: {
    label: 'Zugriff entfernt',
    description: 'Wenn dein Zugriff auf ein Dokument entfernt wird',
    icon: FileText,
    group: 'documents',
  },

  board_updates: {
    label: 'Board-Aufgaben',
    description: 'Wenn es Updates zu deinen Aufgaben gibt',
    icon: LayoutDashboard,
    group: 'board',
    actions: (ctx) => [openLinkAction('Board öffnen')(ctx)],
  },
  board_comment_added: {
    label: 'Neue Kommentare',
    description: 'Wenn jemand eine Karte kommentiert, an der du beteiligt bist',
    icon: MessageSquare,
    group: 'board',
    actions: (ctx) => [openLinkAction('Karte öffnen')(ctx)],
  },
  board_comment_reply: {
    label: 'Antworten auf Kommentare',
    description: 'Wenn jemand auf deinen Kommentar antwortet',
    icon: Reply,
    group: 'board',
    actions: (ctx) => [openLinkAction('Karte öffnen')(ctx)],
  },
  board_user_mentioned: {
    label: 'Erwähnungen',
    description: 'Wenn du in einem Kommentar erwähnt wirst',
    icon: AtSign,
    group: 'board',
    actions: (ctx) => [openLinkAction('Karte öffnen')(ctx)],
  },

  group_activity: {
    label: 'Gruppenaktivität',
    description: 'Allgemeine Aktivität in deinen Gruppen',
    icon: Users,
    group: 'groups',
    actions: (ctx) => [openLinkAction('Gruppe öffnen')(ctx)],
  },
  group_member_joined: {
    label: 'Neue Mitglieder',
    description: 'Wenn jemand deiner Gruppe beitritt',
    icon: UserPlus,
    group: 'groups',
    actions: (ctx) => [openLinkAction('Gruppe öffnen')(ctx)],
  },
  group_role_changed: {
    label: 'Rollenänderung',
    description: 'Wenn deine Rolle geändert wird',
    icon: Shield,
    group: 'groups',
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

  transfer_downloaded: {
    label: 'Transfer-Download',
    description: 'Wenn jemand deine geteilte Datei herunterlädt',
    icon: Download,
    group: 'system',
  },

  wolke_setup: wolkeSetup,
};
