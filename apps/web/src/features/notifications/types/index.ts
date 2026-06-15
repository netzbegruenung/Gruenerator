import {
  CloudDownload,
  FileText,
  Heart,
  LayoutDashboard,
  MessageSquare,
  Share2,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';

import {
  openLinkAction,
  setAvatarAction,
  type NotificationTypeConfig,
} from '../notificationConfig';

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
  agent_task_completed: {
    label: 'Grünerator-Agent',
    description: 'Wenn der Grünerator eine an ihn delegierte Aufgabe erledigt hat',
    icon: Sparkles,
    group: 'board',
    subtypes: ['agent_task_completed', 'agent_task_failed'],
    actions: (ctx) => [openLinkAction('Dokument öffnen')(ctx)],
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
  group_join_requested: {
    label: 'Beitrittsanfragen',
    description:
      'Wenn jemand einer öffentlichen Gruppe beitreten möchte oder deine Anfrage beantwortet wird',
    icon: UserPlus,
    group: 'groups',
    subtypes: ['group_join_requested', 'group_join_approved', 'group_join_denied'],
    actions: (ctx) => [openLinkAction('Gruppe öffnen')(ctx)],
  },

  notebook_liked: {
    label: 'Notizbuch-Likes',
    description: 'Wenn andere dein öffentliches Notizbuch mögen',
    icon: Heart,
    group: 'system',
    actions: (ctx) => [openLinkAction('Notizbuch öffnen')(ctx)],
  },
  template_liked: {
    label: 'Vorlagen-Likes',
    description: 'Wenn andere deine veröffentlichte Vorlage mögen',
    icon: Heart,
    group: 'system',
    actions: (ctx) => [openLinkAction('Vorlage öffnen')(ctx)],
  },
  template_approved: {
    label: 'Vorlagen-Freigabe',
    description: 'Wenn deine eingereichte Vorlage freigegeben oder abgelehnt wird',
    icon: FileText,
    group: 'system',
    subtypes: ['template_approved', 'template_rejected'],
    actions: (ctx) => [openLinkAction('Vorlage öffnen')(ctx)],
  },
  wolke_new_files: {
    label: 'Neue Wolke-Dateien',
    description: 'Wenn in den Wolke-Ordnern deiner Notizbücher neue Dateien gefunden werden',
    icon: CloudDownload,
    group: 'system',
    actions: (ctx) => [openLinkAction('Notizbuch öffnen')(ctx)],
  },
  new_avatars: {
    label: 'Neue Avatare',
    description: 'Wenn neue Profil-Avatare verfügbar sind',
    icon: Sparkles,
    image: '/images/profileimages/11.webp',
    group: 'system',
    actions: (ctx) => [setAvatarAction(11, 'Avatar aktivieren')(ctx)],
  },

  // transfer_downloaded: {
  //   label: 'Transfer-Download',
  //   description: 'Wenn jemand deine geteilte Datei herunterlädt',
  //   icon: Download,
  //   group: 'system',
  // },
};
