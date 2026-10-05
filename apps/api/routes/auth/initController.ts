import express, { type Response, type Router } from 'express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { getProfileService } from '../../services/user/ProfileService.js';
import { createLogger } from '../../utils/logger.js';
import { listOwnedNotebookCollections } from '../notebook/notebookCollectionsContractRouter.js';
import { aggregateRecentActivity } from '../workplace/recentActivityController.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';

const db = getPostgresInstance();
const log = createLogger('auth-init');
const router: Router = express.Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const [groups, savedTexts, notebookCollections, recentActivity, profile] = await Promise.all([
      fetchGroups(userId),
      fetchSavedTexts(userId),
      fetchNotebookCollections(userId),
      // Seed the SAME 30-item shape the workplace section fetches, so the
      // post-login cache seed is identical to a direct /recent-activity call
      // (was a divergent 12-item, canvas-less copy → the flicker bug).
      aggregateRecentActivity(userId, 30).catch((error: unknown) => {
        log.warn('Recent activity fetch failed in init:', error);
        return [];
      }),
      fetchProfile(userId),
    ]);

    res.json({ groups, savedTexts, notebookCollections, recentActivity, profile });
  } catch (error: unknown) {
    log.error('Failed to fetch init data:', error);
    res.status(500).json({ error: 'Failed to fetch init data' });
  }
});

async function fetchGroups(userId: string): Promise<unknown[]> {
  try {
    const memberships = await db.query(
      'SELECT group_id, role, joined_at FROM group_memberships WHERE user_id = $1',
      [userId]
    );

    if (!memberships || memberships.length === 0) return [];

    const groupIds = (memberships as Array<{ group_id: string }>).map((m) => m.group_id);
    const groupsData = await db.query(
      'SELECT id, name, description, created_at, created_by, join_token, settings, avatar_url, links FROM groups WHERE id = ANY($1) AND deleted_at IS NULL',
      [groupIds]
    );

    const membershipByGroupId = new Map(
      (memberships as Array<{ group_id: string; role: string; joined_at: string }>).map((m) => [
        m.group_id,
        m,
      ])
    );

    return (
      (groupsData || []) as Array<{
        id: string;
        name: string;
        description: string;
        created_at: string;
        created_by: string;
        join_token: string;
        settings: unknown;
        avatar_url: string;
        links: unknown;
      }>
    ).map((group) => {
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

async function fetchSavedTexts(userId: string): Promise<unknown[]> {
  try {
    const data = await db.query(
      `SELECT id as document_id, title, content, document_type, created_at
       FROM user_documents
       WHERE user_id = $1 AND is_active = true AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    );

    return (
      (data || []) as Array<{
        document_id: string;
        title: string;
        content: string;
        document_type: string;
        created_at: string;
      }>
    ).map((item) => {
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

// Same list as `listCollections`: the web seeds its list cache from this under
// the same query key, so a second shape here would flash wrong states (#4146).
async function fetchNotebookCollections(userId: string): Promise<unknown[]> {
  try {
    return await listOwnedNotebookCollections(userId);
  } catch (error) {
    log.warn('Notebook collections fetch failed in init:', error);
    return [];
  }
}

async function fetchProfile(userId: string): Promise<unknown> {
  try {
    const profileService = getProfileService();
    const profile = await profileService.getProfileById(userId);
    if (!profile) return null;
    return {
      ...profile,
      is_sso_user: !!profile.keycloak_id,
    };
  } catch (error) {
    log.warn('Profile fetch failed in init:', error);
    return null;
  }
}

export default router;
