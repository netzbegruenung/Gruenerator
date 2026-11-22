import { type MenuAction } from '@expo/ui/community/menu';
import { GROUP_POST_FILE_LIMIT, GROUP_POST_FILE_MAX_BYTES } from '@gruenerator/contracts';
import { canShareIntoGroup, type NativeUploadFile } from '@gruenerator/shared/groups';

export type PostMenuId = 'edit-post' | 'delete-post';

/** Ein angehängtes Foto oder eine Datei im Entwurf. */
export interface DraftFile {
  id: string;
  uri: string;
  name: string;
  type: string;
  size: number;
  isImage: boolean;
}

/** Beiträge schreibt man in jedem Projekt; ins System-Projekt nur Instanz-Admins (wie im Web). */
export function canWritePost(group: { is_system?: boolean | null }, isAdmin: boolean): boolean {
  return canShareIntoGroup({ is_system: group.is_system, isAdmin });
}

/** Ändern darf nur, wer geschrieben hat. */
export function canEditPost(post: { authorId?: string | null }, userId: string | null): boolean {
  return !!userId && post.authorId === userId;
}

/** Löschen darf, wer geschrieben hat, und jede*r Projekt-Admin (der Server prüft es noch einmal). */
export function canDeletePost(
  post: { authorId?: string | null },
  userId: string | null,
  isAdmin: boolean | null | undefined
): boolean {
  return !!isAdmin || canEditPost(post, userId);
}

export function buildPostActions(canEdit: boolean, canDelete: boolean): MenuAction[] {
  const actions: MenuAction[] = [];
  if (canEdit) actions.push({ id: 'edit-post', title: 'Bearbeiten' });
  if (canDelete) {
    actions.push({
      id: 'delete-post',
      title: 'Beitrag löschen',
      attributes: { destructive: true },
    });
  }
  return actions;
}

/** „Alle 12 Mitglieder sehen den Beitrag" — wie im Web; `null`: das System-Projekt. */
export function visibilityHint(memberCount: number | null): string {
  if (memberCount === null) return 'Alle im Grünerator sehen den Beitrag';
  if (memberCount === 1) return 'Nur du siehst den Beitrag';
  return `Alle ${memberCount} Mitglieder sehen den Beitrag`;
}

/**
 * Hängt gewählte Dateien an den Entwurf: zu große und alles über dem Limit
 * bleiben draußen, der Grund steht in `error`.
 */
export function addDraftFiles(
  existing: DraftFile[],
  incoming: Omit<DraftFile, 'id'>[],
  makeId: () => string
): { files: DraftFile[]; error: string | null } {
  const fits = incoming.filter((f) => f.size <= GROUP_POST_FILE_MAX_BYTES);
  const tooBig = incoming.filter((f) => f.size > GROUP_POST_FILE_MAX_BYTES);
  const room = Math.max(0, GROUP_POST_FILE_LIMIT - existing.length);
  const accepted = fits.slice(0, room);
  const dropped = fits.length - accepted.length;
  const error = tooBig.length
    ? `${tooBig.map((f) => f.name).join(', ')}: größer als ${GROUP_POST_FILE_MAX_BYTES / 1024 / 1024} MB.`
    : dropped
      ? `Höchstens ${GROUP_POST_FILE_LIMIT} Dateien pro Beitrag.`
      : null;
  return {
    files: [...existing, ...accepted.map((f) => ({ ...f, id: makeId() }))],
    error,
  };
}

export function toUploadFile(file: DraftFile): NativeUploadFile {
  return { uri: file.uri, name: file.name, type: file.type };
}

export function canSubmitPost(
  text: string,
  fileCount: number,
  tooLong: boolean,
  busy: boolean
): boolean {
  return !busy && !tooLong && (text.trim().length > 0 || fileCount > 0);
}
