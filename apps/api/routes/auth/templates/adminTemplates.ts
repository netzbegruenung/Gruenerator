import express, { type Router, type Response } from 'express';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import { createLogger } from '../../../utils/logger.js';

import type { AuthRequest } from '../types.js';

const log = createLogger('adminTemplates');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

async function verifyAdmin(req: AuthRequest, res: Response): Promise<boolean> {
  const postgres = getPostgresInstance();
  const profile = await postgres.queryOne(
    'SELECT is_admin FROM profiles WHERE id = $1',
    [req.user!.id],
    { table: 'profiles' }
  );
  if (!profile?.is_admin) {
    res.status(403).json({ success: false, message: 'Keine Admin-Berechtigung.' });
    return false;
  }
  return true;
}

router.get(
  '/admin/vorlagen',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!(await verifyAdmin(req, res))) return;

      const { status = 'pending_review', limit = '50', offset = '0' } = req.query;

      const postgres = getPostgresInstance();

      const vorlagen = await postgres.query(
        `SELECT ut.id, ut.title, ut.description, ut.template_type, ut.thumbnail_url,
                ut.external_url, ut.images, ut.categories, ut.tags, ut.content_data,
                ut.metadata, ut.is_private, ut.status, ut.created_at, ut.updated_at,
                p.display_name as creator_name
         FROM user_templates ut
         LEFT JOIN profiles p ON ut.user_id = p.id
         WHERE ut.status = $1
         ORDER BY ut.created_at ASC
         LIMIT $2 OFFSET $3`,
        [status, Number(limit), Number(offset)],
        { table: 'user_templates' }
      );

      res.json({ success: true, data: vorlagen });
    } catch (error) {
      const err = error as Error;
      log.error('[Admin Vorlagen] GET /admin/vorlagen error:', err);
      res.status(500).json({ success: false, message: 'Fehler beim Laden der Vorlagen.' });
    }
  }
);

router.get(
  '/admin/vorlagen/stats',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!(await verifyAdmin(req, res))) return;

      const postgres = getPostgresInstance();

      const result = await postgres.query(
        `SELECT status, COUNT(*)::int as count
         FROM user_templates
         WHERE status IN ('pending_review', 'published', 'rejected')
         GROUP BY status`,
        [],
        { table: 'user_templates' }
      );

      const stats = { pending: 0, published: 0, rejected: 0 };
      for (const row of result as { status: string; count: number }[]) {
        if (row.status === 'pending_review') stats.pending = row.count;
        else if (row.status === 'published') stats.published = row.count;
        else if (row.status === 'rejected') stats.rejected = row.count;
      }

      res.json({ success: true, data: stats });
    } catch (error) {
      const err = error as Error;
      log.error('[Admin Vorlagen] GET /admin/vorlagen/stats error:', err);
      res.status(500).json({ success: false, message: 'Fehler beim Laden der Statistiken.' });
    }
  }
);

router.post(
  '/admin/vorlagen/:id/approve',
  ensureAuthenticated as any,
  async (req: AuthRequest<{ id: string }>, res: Response): Promise<void> => {
    try {
      if (!(await verifyAdmin(req, res))) return;

      const { id } = req.params;
      const postgres = getPostgresInstance();

      const template = await postgres.queryOne(
        'SELECT id, metadata FROM user_templates WHERE id = $1',
        [id],
        { table: 'user_templates' }
      );

      if (!template) {
        res.status(404).json({ success: false, message: 'Vorlage nicht gefunden.' });
        return;
      }

      const existingMetadata = template.metadata || {};
      const updatedMetadata = {
        ...existingMetadata,
        reviewed_by: req.user!.id,
        reviewed_at: new Date().toISOString(),
      };

      await postgres.query(
        `UPDATE user_templates
         SET status = 'published', is_private = false, metadata = $1, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(updatedMetadata), id],
        { table: 'user_templates' }
      );

      log.info(`[Admin Vorlagen] Vorlage ${id} approved by ${req.user!.id}`);
      res.json({ success: true, message: 'Vorlage wurde freigegeben.' });
    } catch (error) {
      const err = error as Error;
      log.error('[Admin Vorlagen] POST approve error:', err);
      res.status(500).json({ success: false, message: 'Fehler beim Freigeben der Vorlage.' });
    }
  }
);

router.post(
  '/admin/vorlagen/:id/reject',
  ensureAuthenticated as any,
  async (req: AuthRequest<{ id: string }>, res: Response): Promise<void> => {
    try {
      if (!(await verifyAdmin(req, res))) return;

      const { id } = req.params;
      const { reason } = req.body;
      const postgres = getPostgresInstance();

      const template = await postgres.queryOne(
        'SELECT id, metadata FROM user_templates WHERE id = $1',
        [id],
        { table: 'user_templates' }
      );

      if (!template) {
        res.status(404).json({ success: false, message: 'Vorlage nicht gefunden.' });
        return;
      }

      const existingMetadata = template.metadata || {};
      const updatedMetadata = {
        ...existingMetadata,
        reviewed_by: req.user!.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason || null,
      };

      await postgres.query(
        `UPDATE user_templates
         SET status = 'rejected', metadata = $1, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(updatedMetadata), id],
        { table: 'user_templates' }
      );

      log.info(`[Admin Vorlagen] Vorlage ${id} rejected by ${req.user!.id}`);
      res.json({ success: true, message: 'Vorlage wurde abgelehnt.' });
    } catch (error) {
      const err = error as Error;
      log.error('[Admin Vorlagen] POST reject error:', err);
      res.status(500).json({ success: false, message: 'Fehler beim Ablehnen der Vorlage.' });
    }
  }
);

export default router;
