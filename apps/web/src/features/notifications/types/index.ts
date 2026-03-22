import { FileText, LayoutDashboard, Share2, Shield, UserPlus, Users } from 'lucide-react';

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

export const NOTIFICATION_TYPES: Record<string, NotificationTypeConfig> = {
  document_shared: {
    label: 'Geteilte Dokumente',
    description: 'E-Mail bei geteilten Dokumenten',
    icon: FileText,
    actions: (ctx) => [openLinkAction('Dokument öffnen')(ctx)],
  },
  document_permission_changed: {
    label: 'Berechtigungsänderungen',
    description: 'Wenn deine Dokument-Berechtigung geändert wird',
    icon: FileText,
    actions: (ctx) => [openLinkAction('Dokument öffnen')(ctx)],
    emailPreference: false,
  },
  document_access_revoked: {
    label: 'Zugriff entfernt',
    description: 'Wenn dein Zugriff auf ein Dokument entfernt wird',
    icon: FileText,
    emailPreference: false,
  },

  board_updates: {
    label: 'Board-Aufgaben',
    description: 'E-Mail bei Aufgaben-Updates',
    icon: LayoutDashboard,
    actions: (ctx) => [openLinkAction('Board öffnen')(ctx)],
  },

  group_activity: {
    label: 'Gruppenaktivität',
    description: 'E-Mail bei Gruppen-Ereignissen',
    icon: Users,
    actions: (ctx) => [openLinkAction('Gruppe öffnen')(ctx)],
  },
  group_member_joined: {
    label: 'Neue Mitglieder',
    description: 'Wenn jemand deiner Gruppe beitritt',
    icon: UserPlus,
    actions: (ctx) => [openLinkAction('Gruppe öffnen')(ctx)],
  },
  group_role_changed: {
    label: 'Rollenänderung',
    description: 'Wenn deine Rolle geändert wird',
    icon: Shield,
    actions: (ctx) => [openLinkAction('Gruppe öffnen')(ctx)],
    emailPreference: false,
  },
  group_content_shared: {
    label: 'Geteilte Inhalte',
    description: 'Wenn Inhalte in deiner Gruppe geteilt werden',
    icon: Share2,
    actions: (ctx) => [openLinkAction('Gruppe öffnen')(ctx)],
  },
  group_deleted: {
    label: 'Gruppe aufgelöst',
    description: 'Wenn eine Gruppe aufgelöst wird',
    icon: Users,
    emailPreference: false,
  },

  wolke_setup: wolkeSetup,
};
