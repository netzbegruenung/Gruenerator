import { type MenuAction } from '@expo/ui/community/menu';
import { replyMention } from '@gruenerator/shared/groups';
import { buildMemberMention } from '@gruenerator/shared/utils';

export interface ReplyTarget {
  /** Kommentar oberster Ebene, an dem die Antwort hängt. */
  threadId: string;
  /** Anzeigename, wie er im Eingabefeld steht („@Anna “). */
  label: string;
  userId: string | null;
  authorName: string;
}

export interface MentionRef {
  label: string;
  userId: string;
}

/** Eigene Kommentare darf jede Person löschen, fremde nur Projekt-Admins (der Server prüft es noch einmal). */
export function canDeleteComment(
  comment: { userId: string | null },
  userId: string | null,
  isAdmin: boolean | null | undefined
): boolean {
  if (isAdmin) return true;
  return !!userId && comment.userId === userId;
}

export const COMMENT_DELETE_ACTIONS: MenuAction[] = [
  { id: 'delete', title: 'Kommentar löschen', attributes: { destructive: true } },
];

export function replyTarget(comment: {
  id: string;
  parentId: string | null;
  userId: string | null;
  authorName: string;
}): ReplyTarget {
  return {
    threadId: comment.parentId ?? comment.id,
    label: comment.authorName.split(' ')[0] ?? comment.authorName,
    userId: comment.userId,
    authorName: comment.authorName,
  };
}

/** Der Anfang einer Antwort: „@Anna “ als Anzeige, dazu die Erwähnung, die beim Senden daraus wird. */
export function replyDraft(target: ReplyTarget): { text: string; mentions: MentionRef[] } {
  if (!target.userId) return { text: replyMention(target.authorName), mentions: [] };
  return {
    text: `@${target.label} `,
    mentions: [{ label: target.label, userId: target.userId }],
  };
}

/** Macht aus „@Anna“ im Entwurf das Token, das der Server versteht; was nicht mehr im Text steht, bleibt weg. */
export function serializeMentions(text: string, mentions: MentionRef[]): string {
  return mentions.reduce(
    (out, m) => out.split(`@${m.label}`).join(buildMemberMention(m.label, m.userId)),
    text
  );
}

export function canSendComment(text: string, busy: boolean): boolean {
  return !busy && text.trim().length > 0;
}
