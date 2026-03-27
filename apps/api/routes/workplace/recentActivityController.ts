import express, { type Response, type Router } from 'express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';

const db = getPostgresInstance();
const log = createLogger('recent-activity');
const router: Router = express.Router();

const DOCS_SUBTYPES = [
  'blank',
  'antrag',
  'pressemitteilung',
  'protokoll',
  'notizen',
  'redaktionsplan',
  'checkliste',
  'einladung',
];

const SUBTYPE_EMOJI: Record<string, string> = {
  blank: '📄',
  antrag: '📋',
  pressemitteilung: '📰',
  protokoll: '📝',
  notizen: '💡',
  redaktionsplan: '📅',
  checkliste: '☑️',
  einladung: '✉️',
};

export interface RecentActivityItem {
  id: string;
  title: string;
  date: string;
  type: 'doc' | 'board' | 'image' | 'video' | 'text';
  href: string;
  emoji?: string;
  boardType?: 'kanban' | 'whiteboard';
  thumbnailUrl?: string;
  duration?: number;
  creatorName?: string;
  accessType?: string;
  deleteEndpoint?: string;
  content?: string;
  documentType?: string;
}

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 30) : 12;

    const [docs, boards, images, reelProjects, texts] = await Promise.all([
      fetchRecentDocs(userId, limit),
      fetchRecentBoards(userId, limit),
      fetchRecentImages(userId, limit),
      fetchRecentReelProjects(userId, limit),
      fetchRecentTexts(userId, limit),
    ]);

    const items: RecentActivityItem[] = [...docs, ...boards, ...images, ...reelProjects, ...texts];

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({ items: items.slice(0, limit) });
  } catch (error: any) {
    log.error('Failed to fetch recent activity:', error);
    res.status(500).json({ error: 'Failed to fetch recent activity' });
  }
});

export async function fetchRecentDocs(
  userId: string,
  limit: number
): Promise<RecentActivityItem[]> {
  const rows = await db.query(
    `SELECT
      cd.id, cd.title, cd.updated_at, cd.document_subtype, cd.created_by,
      p.display_name as creator_name,
      CASE
        WHEN cd.created_by = $1 THEN 'owner'
        WHEN cd.permissions ? $2 THEN 'direct'
        WHEN cd.id IN (
          SELECT gcs.content_id::uuid
          FROM group_content_shares gcs
          INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1
          WHERE gcs.content_type = 'collaborative_documents'
        ) THEN 'group'
      END AS access_type
    FROM collaborative_documents cd
    LEFT JOIN profiles p ON cd.created_by = p.id
    WHERE
      cd.is_deleted = false
      AND cd.document_subtype = ANY($3::text[])
      AND (
        cd.created_by = $1
        OR cd.permissions ? $2
        OR cd.id IN (
          SELECT gcs.content_id::uuid
          FROM group_content_shares gcs
          INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1
          WHERE gcs.content_type = 'collaborative_documents'
        )
      )
    ORDER BY cd.updated_at DESC
    LIMIT $4`,
    [userId, userId, DOCS_SUBTYPES, limit]
  );

  return rows.map((row: any) => ({
    id: row.id,
    title: row.title || 'Unbenanntes Dokument',
    date: row.updated_at,
    type: 'doc' as const,
    href: `/docs/${row.id}`,
    emoji: SUBTYPE_EMOJI[row.document_subtype ?? 'blank'] ?? '📄',
    creatorName: row.creator_name,
    accessType: row.access_type,
    deleteEndpoint: `/api/docs/${row.id}`,
  }));
}

export async function fetchRecentBoards(
  userId: string,
  limit: number
): Promise<RecentActivityItem[]> {
  const rows = await db.query(
    `SELECT
      cd.id, cd.title, cd.updated_at, cd.created_by, cd.content,
      p.display_name as creator_name
    FROM collaborative_documents cd
    LEFT JOIN profiles p ON cd.created_by = p.id
    WHERE
      cd.document_subtype = 'boards'
      AND cd.is_deleted = false
      AND (
        cd.created_by = $1
        OR cd.permissions ? $2
        OR cd.is_public = true
        OR cd.id IN (
          SELECT gcs.content_id::uuid
          FROM group_content_shares gcs
          INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1
          WHERE gcs.content_type = 'collaborative_documents'
        )
      )
    ORDER BY cd.updated_at DESC
    LIMIT $3`,
    [userId, userId, limit]
  );

  return rows.map((row: any) => {
    let boardType: 'kanban' | 'whiteboard' = 'kanban';
    try {
      const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
      if (content?.boardType === 'whiteboard') boardType = 'whiteboard';
    } catch {
      // default to kanban
    }
    return {
      id: row.id,
      title: row.title || 'Unbenanntes Board',
      date: row.updated_at,
      type: 'board' as const,
      href: `/boards/${row.id}`,
      boardType,
      creatorName: row.creator_name,
      deleteEndpoint: `/api/boards/${row.id}`,
    };
  });
}

export async function fetchRecentImages(
  userId: string,
  limit: number
): Promise<RecentActivityItem[]> {
  const rows = await db.query(
    `SELECT id, share_token, title, thumbnail_path, status, created_at
    FROM shared_media
    WHERE user_id = $1 AND media_type = 'image' AND status = 'ready'
    ORDER BY created_at DESC
    LIMIT $2`,
    [userId, limit]
  );

  return rows.map((row: any) => ({
    id: row.share_token,
    title: row.title || 'Ohne Titel',
    date: row.created_at,
    type: 'image' as const,
    href: '/studio/gallery',
    thumbnailUrl: row.thumbnail_path ? `/api/share/${row.share_token}/thumbnail` : undefined,
    deleteEndpoint: `/api/share/${row.share_token}`,
  }));
}

export async function fetchRecentReelProjects(
  userId: string,
  limit: number
): Promise<RecentActivityItem[]> {
  const rows = await db.query(
    `SELECT id, title, thumbnail_path, video_metadata,
            created_at, updated_at, last_edited_at
    FROM subtitler_projects
    WHERE user_id = $1 AND subtitled_video_path IS NOT NULL
    ORDER BY COALESCE(last_edited_at, updated_at, created_at) DESC
    LIMIT $2`,
    [userId, limit]
  );

  return rows.map((row: any) => {
    const metadata =
      typeof row.video_metadata === 'string' ? JSON.parse(row.video_metadata) : row.video_metadata;
    const duration = metadata?.duration ? Math.round(Number(metadata.duration)) : undefined;

    return {
      id: row.id,
      title: row.title || 'Ohne Titel',
      date: row.last_edited_at || row.updated_at || row.created_at,
      type: 'video' as const,
      href: `/studio/video?project=${row.id}`,
      thumbnailUrl: row.thumbnail_path ? `/api/subtitler/projects/${row.id}/thumbnail` : undefined,
      duration,
      deleteEndpoint: `/api/subtitler/projects/${row.id}`,
    };
  });
}

export async function fetchRecentTexts(
  userId: string,
  limit: number
): Promise<RecentActivityItem[]> {
  const rows = await db.query(
    `SELECT id, title, content, document_type, updated_at
    FROM user_documents
    WHERE user_id = $1 AND is_active = true
    ORDER BY updated_at DESC
    LIMIT $2`,
    [userId, limit]
  );

  return rows.map((row: any) => {
    const rawContent = typeof row.content === 'string' ? row.content : '';
    const stripped = rawContent.replace(/<[^>]*>/g, '').slice(0, 500);

    return {
      id: row.id,
      title: row.title || 'Ohne Titel',
      date: row.updated_at,
      type: 'text' as const,
      href: `/texte/texteditor?textId=${row.id}`,
      content: stripped,
      documentType: row.document_type,
      deleteEndpoint: `/api/auth/texts/${row.id}`,
    };
  });
}

export default router;
