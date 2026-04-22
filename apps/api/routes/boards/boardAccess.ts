import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

const db = getPostgresInstance();

export interface BoardAccessResult {
  hasAccess: boolean;
  boardTitle: string | null;
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

  if (rows.length === 0) return { hasAccess: false, boardTitle: null };

  const board = rows[0];
  if (board.created_by === userId || board.is_public || board.permissions?.[userId]) {
    return { hasAccess: true, boardTitle: board.title };
  }

  const groupAccess = (await db.query(
    `SELECT 1 FROM group_content_shares gcs
     INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1 AND gm.is_active = TRUE
     WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = $2
     LIMIT 1`,
    [userId, boardId]
  )) as unknown[];

  return { hasAccess: groupAccess.length > 0, boardTitle: board.title };
}
