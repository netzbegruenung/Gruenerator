import express, { type Response, type Router } from 'express';

import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';
import {
  fetchRecentDocs,
  fetchRecentBoards,
  fetchRecentImages,
  fetchRecentReelProjects,
} from '../workplace/recentActivityController.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { RecentActivityItem } from '../workplace/recentActivityController.js';

const db = getPostgresInstance();
const log = createLogger('auth-init');
const router: Router = express.Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const [groups, savedTexts, notebookCollections, recentActivity] = await Promise.all([
      fetchGroups(userId),
      fetchSavedTexts(userId),
      fetchNotebookCollections(userId),
      fetchRecentActivity(userId),
    ]);

    res.json({ groups, savedTexts, notebookCollections, recentActivity });
  } catch (error: any) {
    log.error('Failed to fetch init data:', error);
    res.status(500).json({ error: 'Failed to fetch init data' });
  }
});

async function fetchGroups(userId: string): Promise<any[]> {
  try {
    const memberships = await db.query(
      'SELECT group_id, role, joined_at FROM group_memberships WHERE user_id = $1',
      [userId]
    );

    if (!memberships || memberships.length === 0) return [];

    const groupIds = memberships.map((m: any) => m.group_id);
    const groupsData = await db.query(
      'SELECT id, name, description, created_at, created_by, join_token, settings, avatar_url, links FROM groups WHERE id = ANY($1)',
      [groupIds]
    );

    const membershipByGroupId = new Map(memberships.map((m: any) => [m.group_id, m]));

    return (groupsData || []).map((group: any) => {
      const membership = membershipByGroupId.get(group.id);
      const role = membership?.role || 'member';
      return {
        ...group,
        role,
        joined_at: membership?.joined_at,
        isAdmin: group.created_by === userId || role === 'admin',
      };
    });
  } catch (error) {
    log.warn('Groups fetch failed in init:', error);
    return [];
  }
}

async function fetchSavedTexts(userId: string): Promise<any[]> {
  try {
    const data = await db.query(
      `SELECT id as document_id, title, content, document_type, created_at
       FROM user_documents
       WHERE user_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    );

    return (data || []).map((item: any) => {
      let plainText = item.content || '';
      let prev: string;
      do {
        prev = plainText;
        plainText = plainText.replace(/<[^>]*>/g, '');
      } while (plainText !== prev);
      plainText = plainText.trim();
      const wordCount = plainText.split(/\s+/).filter((w: string) => w.length > 0).length;
      return {
        id: item.document_id,
        title: item.title,
        content: item.content || '',
        type: item.document_type,
        created_at: item.created_at,
        word_count: wordCount,
        character_count: plainText.length,
      };
    });
  } catch (error) {
    log.warn('Saved texts fetch failed in init:', error);
    return [];
  }
}

async function fetchNotebookCollections(userId: string): Promise<any[]> {
  try {
    const notebookHelper = new NotebookQdrantHelper();
    const collections = await notebookHelper.getUserNotebookCollections(userId);

    return await Promise.all(
      (collections as any[]).map(async (collection) => {
        const documentIds = (collection.notebook_collection_documents || []).map(
          (qcd: any) => qcd.document_id
        );

        let documents: any[] = [];
        if (documentIds.length > 0) {
          documents = await db.query(
            'SELECT id, title, page_count, created_at, source_type, wolke_share_link_id FROM documents WHERE id = ANY($1)',
            [documentIds]
          );
        }

        let wolke_share_links: any[] = [];
        if (collection.wolke_share_link_ids) {
          wolke_share_links = collection.wolke_share_link_ids.map((id: string) => ({ id }));
        }

        const settings = (collection.settings as Record<string, unknown>) || {};
        const labels = Array.isArray(settings.labels) ? settings.labels : [];

        return {
          ...collection,
          documents,
          document_count: documents.length,
          selection_mode: collection.selection_mode || 'documents',
          wolke_share_links,
          has_wolke_sources: wolke_share_links.length > 0,
          documents_from_wolke: documents.filter((doc: any) => doc.source_type === 'wolke').length,
          auto_sync: !!collection.auto_sync,
          remove_missing_on_sync: !!collection.remove_missing_on_sync,
          labels,
        };
      })
    );
  } catch (error) {
    log.warn('Notebook collections fetch failed in init:', error);
    return [];
  }
}

async function fetchRecentActivity(userId: string): Promise<RecentActivityItem[]> {
  try {
    const limit = 12;
    const [docs, boards, images, reelProjects] = await Promise.all([
      fetchRecentDocs(userId, limit),
      fetchRecentBoards(userId, limit),
      fetchRecentImages(userId, limit),
      fetchRecentReelProjects(userId, limit),
    ]);

    const items = [...docs, ...boards, ...images, ...reelProjects];
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items.slice(0, limit);
  } catch (error) {
    log.warn('Recent activity fetch failed in init:', error);
    return [];
  }
}

export default router;
