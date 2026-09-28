/**
 * Benachrichtigungen zu neuen Beiträgen und Kommentaren samt Erwähnungen.
 *
 * - `@alle` erreicht alle Mitglieder und ersetzt die Grundmeldung. In der
 *   System-Gruppe (alle Nutzer*innen) nur für Instanz-Admins, sonst ist es Text.
 * - `@[Name](user:<uuid>)` erreicht die Person, die dafür aus der Grundmeldung
 *   fällt. In der System-Gruppe sind Mitglieder verborgen; dort erreicht eine
 *   Erwähnung nur, wer ohnehin im Thread steht.
 * - Beim Bearbeiten (`previousBody`) zählen nur neu hinzugekommene Erwähnungen.
 *
 * Alles läuft über `notifyGroup*` — dort bleibt die System-Gruppe ohne E-Mail.
 */
import { groupMentionsToPlain, parseGroupMentions } from '@gruenerator/shared/utils';

import { notifyGroupMembers, notifyGroupUsers } from '../notifications/index.js';

import type { NotificationType } from '../notifications/types.js';

export interface GroupActivityNotifiers {
  members: typeof notifyGroupMembers;
  users: typeof notifyGroupUsers;
}

export interface GroupActivity {
  groupId: string;
  authorId: string;
  authorName: string;
  /** Text mit Erwähnungs-Tokens. */
  body: string;
  /** Fassung vor dem Bearbeiten; ihre Erwähnungen wurden schon benachrichtigt. */
  previousBody?: string;
  isSystem: boolean;
  mayMentionAll: boolean;
  actionUrl: string;
  metadata: Record<string, unknown>;
  /** Die Meldung ohne Erwähnung; `null` beim Bearbeiten. */
  base: {
    type: NotificationType;
    title: string;
    recipients: 'members' | string[];
    /** Anstelle des Texts, etwa „Jana hat eine Datei geteilt“. */
    summary?: string;
  } | null;
}

const PREVIEW_MAX = 140;

function preview(authorName: string, body: string): string {
  const plain = groupMentionsToPlain(body);
  return `${authorName}: ${plain.length > PREVIEW_MAX ? `${plain.slice(0, PREVIEW_MAX)}…` : plain}`;
}

const DEFAULT_NOTIFIERS: GroupActivityNotifiers = {
  members: notifyGroupMembers,
  users: notifyGroupUsers,
};

export async function notifyGroupActivity(
  a: GroupActivity,
  n: GroupActivityNotifiers = DEFAULT_NOTIFIERS
): Promise<void> {
  const now = parseGroupMentions(a.body);
  const before = a.previousBody ? parseGroupMentions(a.previousBody) : { userIds: [], all: false };
  const common = {
    groupId: a.groupId,
    excludeUserId: a.authorId,
    actionUrl: a.actionUrl,
    metadata: a.metadata,
  };
  const body = a.body ? preview(a.authorName, a.body) : '';

  if (now.all && !before.all && a.mayMentionAll) {
    await n.members({
      ...common,
      type: 'group_mention_all',
      title: `${a.authorName} an @alle`,
      body,
    });
    return;
  }

  const threadIds = Array.isArray(a.base?.recipients) ? a.base.recipients : [];
  const mentioned = now.userIds.filter(
    (id) =>
      id !== a.authorId && !before.userIds.includes(id) && (!a.isSystem || threadIds.includes(id))
  );

  const tasks: Promise<void>[] = [];
  if (mentioned.length > 0) {
    tasks.push(
      n.users({
        ...common,
        userIds: mentioned,
        type: 'group_user_mentioned',
        title: `${a.authorName} hat dich erwähnt`,
        body,
      })
    );
  }
  if (a.base) {
    const baseParams = {
      ...common,
      type: a.base.type,
      title: a.base.title,
      body: a.base.summary ?? body,
      skipUserIds: mentioned,
    };
    tasks.push(
      a.base.recipients === 'members'
        ? n.members(baseParams)
        : n.users({
            ...baseParams,
            userIds: a.base.recipients.filter((id) => !mentioned.includes(id)),
          })
    );
  }
  await Promise.all(tasks);
}
