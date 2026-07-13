import { type BoardContent, type BoardPreview, type BoardType } from '@gruenerator/contracts';
import express, { type Response, type Router } from 'express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { CANVAS_ACCESS_WHERE, CANVAS_SUBTYPE } from '../../services/canvas/canvasRepository.js';
import { USER_VISIBLE_SHARE_STATUSES } from '../../services/sharedMediaService.js';
import { createLogger } from '../../utils/logger.js';
import { getSharedMediaService } from '../share/shareServices.js';

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
  // Spreadsheet-style docs (created via chat "save as Tabelle"). They open at
  // /docs/:id like any doc; the frontend renders a grid preview off
  // documentType === 'tabelle' instead of the prose excerpt.
  'tabelle',
  // Univer spreadsheets and reveal.js decks: they too open at /docs/:id (the
  // route dispatches on subtype) so they surface as `type: 'doc'`.
  'sheets',
  'presentations',
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
  tabelle: '📊',
  sheets: '📊',
  presentations: '🎬',
};

export interface RecentActivityItem {
  id: string;
  title: string;
  date: string;
  type: 'doc' | 'board' | 'image' | 'video' | 'canvas';
  href: string;
  emoji?: string | undefined;
  boardType?: 'kanban' | 'whiteboard' | undefined;
  preview?: BoardPreview | undefined;
  thumbnailUrl?: string | undefined;
  duration?: number | undefined;
  creatorName?: string | undefined;
  accessType?: string | undefined;
  deleteEndpoint?: string | undefined;
  content?: string | undefined;
  documentType?: string | undefined;
  blurhash?: string | undefined;
}

// One failing source (e.g. the canvas JOIN) must degrade to a missing strip,
// not a 500 that blanks the whole "Zuletzt" section. Each fetcher is wrapped
// so a rejection resolves to [] — the same graceful-degradation the images
// fetcher already relied on, now applied uniformly.
async function safe(
  label: string,
  fetch: () => Promise<RecentActivityItem[]>
): Promise<RecentActivityItem[]> {
  try {
    return await fetch();
  } catch (error) {
    log.error(`Failed to fetch recent ${label}:`, error);
    return [];
  }
}

/**
 * Canonical recent-activity aggregation. Both the `/recent-activity` route and
 * `/auth/init`'s seed call this, so the workplace section and the post-login
 * cache seed return identical data — the earlier drift (init omitted canvases
 * and used a different limit) is what made canvases flicker in and out.
 */
export async function aggregateRecentActivity(
  userId: string,
  limit: number
): Promise<RecentActivityItem[]> {
  const [docs, boards, images, reelProjects, canvases] = await Promise.all([
    safe('docs', () => fetchRecentDocs(userId, limit)),
    safe('boards', () => fetchRecentBoards(userId, limit)),
    safe('images', () => fetchRecentImages(userId, limit)),
    safe('reels', () => fetchRecentReelProjects(userId, limit)),
    safe('canvases', () => fetchRecentCanvases(userId, limit)),
  ]);

  const items: RecentActivityItem[] = [...docs, ...boards, ...images, ...reelProjects, ...canvases];
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return items.slice(0, limit);
}

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 30) : 12;

    const items = await aggregateRecentActivity(userId, limit);
    res.json({ items });
  } catch (error: unknown) {
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
      cd.id, cd.title, cd.updated_at, cd.document_subtype, cd.content, cd.created_by,
      p.display_name as creator_name,
      CASE
        WHEN cd.created_by = $1 THEN 'owner'
        WHEN cd.permissions ? $2::text THEN 'direct'
        WHEN cd.id IN (
          SELECT gcs.content_id::uuid
          FROM group_content_shares gcs
          INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1 AND gm.is_active = TRUE
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
        OR cd.permissions ? $2::text
        OR cd.id IN (
          SELECT gcs.content_id::uuid
          FROM group_content_shares gcs
          INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1 AND gm.is_active = TRUE
          WHERE gcs.content_type = 'collaborative_documents'
        )
      )
    ORDER BY cd.updated_at DESC
    LIMIT $4`,
    [userId, userId, DOCS_SUBTYPES, limit]
  );

  return (
    rows as Array<{
      id: string;
      title: string;
      updated_at: string;
      document_subtype: string | null;
      content: string | null;
      creator_name: string;
      access_type: string;
    }>
  ).map((row) => ({
    id: row.id,
    title: row.title || 'Unbenanntes Dokument',
    date: row.updated_at,
    type: 'doc' as const,
    href: `/office/${row.id}`,
    emoji: SUBTYPE_EMOJI[row.document_subtype ?? 'blank'] ?? '📄',
    documentType: row.document_subtype ?? 'blank',
    ...(row.content != null && { content: row.content }),
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
      p.display_name as creator_name,
      CASE
        WHEN cd.created_by = $1 THEN 'owner'
        WHEN cd.permissions ? $2::text THEN 'direct'
        WHEN cd.id IN (
          SELECT gcs.content_id::uuid
          FROM group_content_shares gcs
          INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1 AND gm.is_active = TRUE
          WHERE gcs.content_type = 'collaborative_documents'
        ) THEN 'group'
      END AS access_type
    FROM collaborative_documents cd
    LEFT JOIN profiles p ON cd.created_by = p.id
    WHERE
      cd.document_subtype = 'boards'
      AND cd.is_deleted = false
      AND (
        cd.created_by = $1
        OR cd.permissions ? $2::text
        OR cd.id IN (
          SELECT gcs.content_id::uuid
          FROM group_content_shares gcs
          INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1 AND gm.is_active = TRUE
          WHERE gcs.content_type = 'collaborative_documents'
        )
      )
    ORDER BY cd.updated_at DESC
    LIMIT $3`,
    [userId, userId, limit]
  );

  return (
    rows as Array<{
      id: string;
      title: string;
      updated_at: string;
      created_by: string;
      content: string | BoardContent | null;
      creator_name: string;
      access_type: string | null;
    }>
  ).map((row) => {
    let boardType: BoardType = 'kanban';
    let preview: BoardPreview | null = null;
    try {
      // Parse into the contract type (BoardContent) rather than a hand-written cast,
      // so the field name is checked against boardContentSchema. The metadata column
      // stores `board_type` (snake_case) — an earlier `boardType` typo silently
      // defaulted every board to kanban because the cast invented its own shape;
      // typing it through the schema makes that a typecheck error instead.
      const content: BoardContent | null =
        typeof row.content === 'string' ? (JSON.parse(row.content) as BoardContent) : row.content;
      if (content && typeof content !== 'string') {
        if (content.board_type === 'whiteboard') boardType = 'whiteboard';
        preview = content.preview ?? null;
      }
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
      ...(preview ? { preview } : {}),
      creatorName: row.creator_name,
      accessType: row.access_type ?? undefined,
      deleteEndpoint: `/api/boards/${row.id}`,
    };
  });
}

export async function fetchRecentImages(
  userId: string,
  limit: number
): Promise<RecentActivityItem[]> {
  // Status policy lives in the service (USER_VISIBLE_SHARE_STATUSES) — this
  // surface shows everything the user's own galleries show, drafts included.
  // Errors here degrade to a missing strip via the `safe()` wrapper in
  // aggregateRecentActivity, so no local try/catch is needed.
  const service = await getSharedMediaService();
  const rows = await service.getUserShares(userId, 'image', USER_VISIBLE_SHARE_STATUSES, limit);

  return rows.map((row) => ({
    id: row.share_token,
    title: row.title || 'Ohne Titel',
    date: row.created_at.toISOString(),
    type: 'image' as const,
    href: `/share/${row.share_token}`,
    // Fresh shares have thumbnail_path=null until the async variants pass
    // finishes — fall back to the on-demand preview route so the tile isn't
    // blank. ?w=400 hits the pre-generated variant widths (200/400/800) and
    // the thumbs/ disk cache instead of streaming the full-size original.
    thumbnailUrl: row.thumbnail_path
      ? `/api/share/${row.share_token}/thumbnail`
      : `/api/share/${row.share_token}/preview?w=400&fmt=webp`,
    deleteEndpoint: `/api/share/${row.share_token}`,
    // BlurHash (pre-generated by processMediaVariants into image_metadata) gives
    // the tile an instant placeholder while the /preview variant is still being
    // generated — otherwise a fresh share renders as a blank plate.
    blurhash: (row.image_metadata as { blurhash?: string } | null)?.blurhash,
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

  return (
    rows as Array<{
      id: string;
      title: string;
      thumbnail_path: string | null;
      video_metadata: string | Record<string, unknown>;
      created_at: string;
      updated_at: string;
      last_edited_at: string | null;
    }>
  ).map((row) => {
    const metadata = (
      typeof row.video_metadata === 'string' ? JSON.parse(row.video_metadata) : row.video_metadata
    ) as { duration?: number | string } | null;
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

export async function fetchRecentCanvases(
  userId: string,
  limit: number
): Promise<RecentActivityItem[]> {
  const rows = await db.query(
    `SELECT
      cd.id, cd.title, cd.updated_at, cd.created_by, cdoc.thumbnail_url,
      p.display_name as creator_name,
      CASE
        WHEN cd.created_by = $2 THEN 'owner'
        WHEN cd.permissions ? $3::text THEN 'direct'
        WHEN cd.id IN (
          SELECT gcs.content_id::uuid
          FROM group_content_shares gcs
          INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $2 AND gm.is_active = TRUE
          WHERE gcs.content_type = 'collaborative_documents'
        ) THEN 'group'
      END AS access_type
    FROM collaborative_documents cd
    INNER JOIN canvas_documents cdoc ON cdoc.document_id = cd.id
    LEFT JOIN profiles p ON cd.created_by = p.id
    WHERE ${CANVAS_ACCESS_WHERE}
    ORDER BY cd.updated_at DESC
    LIMIT $4`,
    [CANVAS_SUBTYPE, userId, userId, limit]
  );

  return (
    rows as Array<{
      id: string;
      title: string;
      updated_at: string;
      created_by: string;
      thumbnail_url: string | null;
      creator_name: string | null;
      access_type: string | null;
    }>
  ).map((row) => ({
    id: row.id,
    title: row.title || 'Neuer Canvas',
    date: row.updated_at,
    type: 'canvas' as const,
    href: `/studio/canvas/${row.id}`,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    creatorName: row.creator_name ?? undefined,
    accessType: row.access_type ?? undefined,
    deleteEndpoint: `/api/canvas/${row.id}`,
  }));
}

export default router;
