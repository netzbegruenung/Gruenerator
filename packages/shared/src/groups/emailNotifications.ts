import { type GroupEmailNotifications } from '@gruenerator/contracts';

/**
 * The per-project email setting as shown in web and app. In-app notifications
 * (the bell) are unaffected by it. 'mentions' is the server default.
 */
export const GROUP_EMAIL_NOTIFICATION_OPTIONS = [
  {
    value: 'mentions',
    label: 'Nur Erwähnungen',
    description: 'Wenn dich jemand erwähnt, @alle schreibt oder es um deine Mitgliedschaft geht.',
  },
  {
    value: 'all',
    label: 'Alle Neuigkeiten',
    description: 'Zusätzlich neue Beiträge, Freigaben und Kommentare.',
  },
  {
    value: 'none',
    label: 'Keine E-Mails',
    description: 'Alles erscheint nur in der Glocke.',
  },
] as const satisfies ReadonlyArray<{
  value: GroupEmailNotifications;
  label: string;
  description: string;
}>;

export const DEFAULT_GROUP_EMAIL_NOTIFICATIONS: GroupEmailNotifications = 'mentions';
