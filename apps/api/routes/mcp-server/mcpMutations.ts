/**
 * MCP-native handlers for the four personal-data actions that use the chat
 * SSE-confirm flow (`emitToolConfirmAction` → confirmController). MCP has no
 * confirm cards; irreversible/socially-visible mutations use the in-band
 * two-step `confirm=true` protocol instead, the rest execute directly against
 * the same service layer the confirm executor calls.
 */
import { buildGroupSlug } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { addRowsToBoard } from '../../services/boards/BoardService.js';
import { shareDocumentToGroup } from '../../services/docs/shareDocumentToGroup.js';
import {
  createGroupForUser,
  getGroupByToken,
  joinGroupByToken,
} from '../../services/groups/groupMutations.js';
import { findGroups } from '../../services/groups/groupQueries.js';
import { hasWriteAccess } from '../chat/confirmController.js';

import { absolutizeUrl } from './chatToolBridge.js';

/** Point lookup for a live collaborative_documents row (board, doc, sheet …). */
async function findLiveDocument(id: string): Promise<{ title: string; created_by: string } | null> {
  const rows = (await getPostgresInstance().query(
    'SELECT title, created_by FROM collaborative_documents WHERE id = $1 AND is_deleted = false',
    [id]
  )) as { title: string; created_by: string }[];
  return rows[0] ?? null;
}

type ToolResult =
  | { ok: true; note: string }
  | { needsConfirmation: true; note: string }
  | { error: string };

export async function addCardDirect(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const boardId = typeof args.boardId === 'string' ? args.boardId : null;
  const title = typeof args.title === 'string' ? args.title.trim() : '';
  if (!boardId || !title) return { error: 'add_card braucht boardId und title.' };

  // Point lookup — addRowsToBoard loads/decodes the Yjs doc itself, a full
  // loadBoardState here would decode the board twice.
  const board = await findLiveDocument(boardId);
  if (!board) return { error: 'Board nicht gefunden oder kein Zugriff.' };
  if (!(await hasWriteAccess(boardId, userId))) {
    return { error: 'Keine Berechtigung, dieses Board zu bearbeiten.' };
  }

  const row: Record<string, unknown> = { title };
  if (typeof args.status === 'string' && args.status) row.status = args.status;
  if (typeof args.description === 'string' && args.description) row.description = args.description;
  if (typeof args.dueDate === 'string' && args.dueDate) row.dueDate = args.dueDate;
  if (typeof args.assignee === 'string' && args.assignee) row.assignee = args.assignee;

  await addRowsToBoard(boardId, [row], userId);
  return {
    ok: true,
    note: `Karte „${title}" wurde zu „${board.title}" hinzugefügt (${absolutizeUrl(`/boards/${boardId}`)}).`,
  };
}

export async function createGroupDirect(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  if (!name) return { error: 'create braucht einen name.' };
  const description = typeof args.description === 'string' ? args.description.trim() || null : null;

  const group = await createGroupForUser(userId, { name, description });
  const slug = group.slug_suffix ? buildGroupSlug(group.name, group.slug_suffix) : group.id;
  return {
    ok: true,
    note: `Gruppe „${group.name}" wurde erstellt (${absolutizeUrl(`/gruppen/${slug}`)}).`,
  };
}

export async function joinGroupDirect(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const token = typeof args.joinToken === 'string' ? args.joinToken.trim() : '';
  if (!token) return { error: 'join braucht einen joinToken.' };

  // Joining is socially visible (members get notified with the user's name) —
  // two-step confirm like delete/share. The preview resolves the group name;
  // the confirmed call skips the pre-check (joinGroupByToken re-resolves).
  if (args.confirm !== true) {
    const group = await getGroupByToken(token);
    if (!group) return { error: 'Ungültiger oder abgelaufener Einladungslink.' };
    return {
      needsConfirmation: true,
      note: `Der Gruppe „${group.name}" beitreten? Die Mitglieder werden benachrichtigt. Frage die Person und rufe join erst mit confirm=true erneut auf.`,
    };
  }

  const rows = (await getPostgresInstance().query(
    'SELECT display_name FROM profiles WHERE id = $1',
    [userId]
  )) as { display_name: string | null }[];
  const joinerName = rows[0]?.display_name || 'Jemand';

  const outcome = await joinGroupByToken(userId, token, joinerName);
  if (!outcome) return { error: 'Ungültiger oder abgelaufener Einladungslink.' };
  return {
    ok: true,
    note: outcome.alreadyMember
      ? `Du bist bereits Mitglied von „${outcome.group.name}".`
      : `Du bist der Gruppe „${outcome.group.name}" beigetreten.`,
  };
}

export async function shareDocToGroupMcp(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const id = typeof args.id === 'string' ? args.id : null;
  const groupName = typeof args.groupName === 'string' ? args.groupName.trim() : '';
  const permission = args.permission === 'editor' ? 'editor' : 'viewer';
  if (!id) return { error: 'share_to_group braucht eine Dokument-id (aus list).' };
  if (!groupName) return { error: 'share_to_group braucht groupName.' };

  const doc = await findLiveDocument(id);
  if (!doc || doc.created_by !== userId) {
    return { error: 'Dokument nicht gefunden oder kein Zugriff.' };
  }

  // Only member groups — findGroups also returns public groups with empty role.
  const groups = await findGroups(userId, groupName, 5);
  const group = groups.find((g) => g.role);
  if (!group) return { error: `Keine Gruppe „${groupName}" gefunden, der du angehörst.` };

  if (args.confirm !== true) {
    return {
      needsConfirmation: true,
      note: `„${doc.title}" mit der Gruppe „${group.name}" teilen (${permission === 'editor' ? 'Bearbeiten' : 'Nur lesen'})? Frage die Person und rufe share_to_group erst mit confirm=true erneut auf.`,
    };
  }

  try {
    const result = await shareDocumentToGroup({
      userId,
      docId: id,
      docTitle: doc.title,
      groupId: group.id,
      groupName: group.name,
      permissionLevel: permission,
    });
    return { ok: true, note: result.message };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Teilen fehlgeschlagen.' };
  }
}
