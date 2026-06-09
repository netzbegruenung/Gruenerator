import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

const db = getPostgresInstance();

export interface BoardAccessResult {
  hasAccess: boolean;
  boardTitle: string | null;
  /** Board owner (collaborative_documents.created_by); null when the board does not exist. */
  createdBy: string | null;
  /** True when the user may write to the board (owner, or editor/owner permission). */
  canEdit: boolean;
}

export async function checkBoardAccess(
  boardId: string,
  userId: string
): Promise<BoardAccessResult> {
  const rows = (await db.query(
    `SELECT cd.title, cd.created_by, cd.permissions, cd.is_public
     FROM collaborative_documents cd
     WHERE cd.id = $1 AND cd.document_subtype = 'boards' AND cd.is_deleted = false`,
    [boardId]
  )) as Array<{
    title: string;
    created_by: string;
    permissions: Record<string, { level: string }> | null;
    is_public: boolean;
  }>;

  if (rows.length === 0)
    return { hasAccess: false, boardTitle: null, createdBy: null, canEdit: false };

  const board = rows[0];
  const isOwner = board.created_by === userId;
  const permLevel = board.permissions?.[userId]?.level;
  const canEdit = isOwner || permLevel === 'owner' || permLevel === 'editor';

  if (isOwner || board.is_public || board.permissions?.[userId]) {
    return { hasAccess: true, boardTitle: board.title, createdBy: board.created_by, canEdit };
  }

  // Group shares grant edit access (matches the existing share semantics where a
  // shared board is editable by group members).
  const groupAccess = (await db.query(
    `SELECT 1 FROM group_content_shares gcs
     INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1 AND gm.is_active = TRUE
     WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = $2
     LIMIT 1`,
    [userId, boardId]
  )) as unknown[];

  const hasGroupAccess = groupAccess.length > 0;
  return {
    hasAccess: hasGroupAccess,
    boardTitle: board.title,
    createdBy: board.created_by,
    canEdit: hasGroupAccess,
  };
}
