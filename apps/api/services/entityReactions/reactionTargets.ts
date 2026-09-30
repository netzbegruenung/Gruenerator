/**
 * Wer auf welche Entität reagieren darf — eine Prüfung je `ReactionEntityType`.
 *
 * - `group_share` / `group_comment`: Mitglied der Gruppe (`findViewer` aus dem
 *   Gruppen-Feed); in Projekten (`group_type='personal'`) gibt es wie beim
 *   Kommentieren keine Reaktionen.
 * - `board_comment`: Zugriff aufs Board des Kommentars (`checkBoardAccess`,
 *   dieselbe Prüfung wie die Board-Kommentar-Routen).
 *
 * Gruppe im Papierkorb, gelöschtes Board oder unbekannte id → `not_found`.
 *
 * `onChanged` läuft nach jedem erfolgreichen Hinzufügen/Entfernen: bei
 * `board_comment` stupst es die Karte an (`bumpCardComments`), damit andere
 * Board-Clients den Kommentar-Thread neu laden. Gruppen brauchen keinen Hook.
 */
import { type ReactionEntityType } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { checkBoardAccess } from '../../routes/boards/boardAccess.js';
import { isInstanceAdmin } from '../../utils/adminAuthz.js';
import { bumpCardComments } from '../boards/boardLiveSignalService.js';
import { findViewer, type GroupFeedDeps } from '../groups/groupFeed.js';

export type ReactionAccess = 'ok' | 'not_found' | 'forbidden';

export interface ReactionTargetResult {
  access: ReactionAccess;
  /** Nach erfolgreicher Änderung aufrufen; fire-and-forget, wirft nie. */
  onChanged?: () => void;
}

export type ReactionTargetCheck = (
  userId: string,
  entityId: string
) => Promise<ReactionTargetResult>;

export interface ReactionTargetDeps {
  postgres: Pick<GroupFeedDeps['postgres'], 'queryOne'>;
  isInstanceAdmin: (userId: string) => Promise<boolean>;
  checkBoardAccess: typeof checkBoardAccess;
  bumpCardComments: typeof bumpCardComments;
}

function defaultDeps(): ReactionTargetDeps {
  return { postgres: getPostgresInstance(), isInstanceAdmin, checkBoardAccess, bumpCardComments };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function checkGroupMember(
  deps: ReactionTargetDeps,
  groupId: string | null,
  userId: string
): Promise<ReactionAccess> {
  if (!groupId) return 'not_found';
  const viewer = await findViewer(deps.postgres, groupId, userId, deps.isInstanceAdmin);
  if (!viewer || viewer.isPersonal) return 'forbidden';
  return 'ok';
}

export async function checkGroupShareReaction(
  userId: string,
  shareId: string,
  deps: ReactionTargetDeps = defaultDeps()
): Promise<ReactionAccess> {
  if (!UUID_RE.test(shareId)) return 'not_found';
  const row = (await deps.postgres.queryOne(
    `SELECT gcs.group_id FROM group_content_shares gcs
       JOIN groups g ON g.id = gcs.group_id
      WHERE gcs.id = $1 AND g.deleted_at IS NULL`,
    [shareId],
    { table: 'group_content_shares' }
  )) as { group_id: string } | null;
  return checkGroupMember(deps, row?.group_id ?? null, userId);
}

export async function checkGroupCommentReaction(
  userId: string,
  commentId: string,
  deps: ReactionTargetDeps = defaultDeps()
): Promise<ReactionAccess> {
  if (!UUID_RE.test(commentId)) return 'not_found';
  const row = (await deps.postgres.queryOne(
    `SELECT c.group_id FROM group_share_comments c
       JOIN groups g ON g.id = c.group_id
      WHERE c.id = $1 AND g.deleted_at IS NULL`,
    [commentId],
    { table: 'group_share_comments' }
  )) as { group_id: string } | null;
  return checkGroupMember(deps, row?.group_id ?? null, userId);
}

export async function checkBoardCommentReaction(
  userId: string,
  commentId: string,
  deps: ReactionTargetDeps = defaultDeps()
): Promise<ReactionTargetResult> {
  if (!UUID_RE.test(commentId)) return { access: 'not_found' };
  const row = (await deps.postgres.queryOne(
    'SELECT board_id, card_id FROM board_comments WHERE id = $1',
    [commentId],
    { table: 'board_comments' }
  )) as { board_id: string; card_id: string } | null;
  if (!row) return { access: 'not_found' };
  const access = await deps.checkBoardAccess(row.board_id, userId);
  if (access.createdBy === null) return { access: 'not_found' };
  if (!access.hasAccess) return { access: 'forbidden' };
  return { access: 'ok', onChanged: () => void deps.bumpCardComments(row.board_id, row.card_id) };
}

export const reactionTargets: Record<ReactionEntityType, ReactionTargetCheck> = {
  group_share: async (userId, id) => ({ access: await checkGroupShareReaction(userId, id) }),
  group_comment: async (userId, id) => ({ access: await checkGroupCommentReaction(userId, id) }),
  board_comment: (userId, id) => checkBoardCommentReaction(userId, id),
};
