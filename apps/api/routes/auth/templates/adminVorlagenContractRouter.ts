/**
 * ts-rest contract router for admin Vorlagen (template review) endpoints.
 *
 * Covers 4 routes from adminTemplates.ts:
 *   - GET  /api/auth/admin/vorlagen
 *   - GET  /api/auth/admin/vorlagen/stats
 *   - POST /api/auth/admin/vorlagen/:id/approve
 *   - POST /api/auth/admin/vorlagen/:id/reject
 *
 * All routes require authentication + is_admin check (auth from requireAuth
 * middleware in routes.ts; admin check enforced per-handler via verifyAdmin).
 */

import { adminVorlagenContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { createNotification } from '../../../services/notifications/index.js';
import { enrichTemplate } from '../../../services/templates/templateEnrichment.js';
import { isAdminByEmail } from '../../../utils/adminEmails.js';
import { logContractValidationError } from '../../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../../utils/getAuthedUser.js';
import { createLogger } from '../../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('adminVorlagenContractRouter');

async function checkIsAdmin(userId: string, email?: string): Promise<boolean> {
  if (isAdminByEmail(email)) return true;
  const postgres = getPostgresInstance();
  const profile = await postgres.queryOne(
    'SELECT is_admin, email FROM profiles WHERE id = $1',
    [userId],
    { table: 'profiles' }
  );
  const allowed = Boolean(profile?.is_admin);
  if (!allowed) {
    log.warn(
      '[adminVorlagenContract] admin check denied: session user_id=%s session_email=%s profile_found=%s profile_email=%s profile_is_admin=%s',
      userId,
      email ?? '(none)',
      profile ? 'yes' : 'no',
      profile?.email ?? '(null)',
      profile?.is_admin
    );
  }
  return allowed;
}

const FORBIDDEN = {
  status: 403 as const,
  body: { success: false, message: 'Keine Admin-Berechtigung.' },
};

const s = initServer();

export const adminVorlagenContractRouter = s.router(adminVorlagenContract, {
  list: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      const userId = authedUser.id;
      if (!(await checkIsAdmin(userId, authedUser.email))) return FORBIDDEN;

      const { status = 'pending_review', limit = '50', offset = '0' } = args.query;
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
        [status ?? 'pending_review', Number(limit ?? '50'), Number(offset ?? '0')],
        { table: 'user_templates' }
      );

      return { status: 200 as const, body: { success: true, data: vorlagen as never[] } };
    } catch (error) {
      log.error('[adminVorlagenContract.list] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden der Vorlagen.' },
      };
    }
  },

  getStats: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      const userId = authedUser.id;
      if (!(await checkIsAdmin(userId, authedUser.email))) return FORBIDDEN;

      const postgres = getPostgresInstance();
      const result = await postgres.query(
        `SELECT status, COUNT(*)::int as count
         FROM user_templates
         WHERE status IN ('pending_review', 'published', 'rejected')
         GROUP BY status`,
        [],
        { table: 'user_templates' }
      );

      const statsData = { pending: 0, published: 0, rejected: 0 };
      for (const row of result as { status: string; count: number }[]) {
        if (row.status === 'pending_review') statsData.pending = row.count;
        else if (row.status === 'published') statsData.published = row.count;
        else if (row.status === 'rejected') statsData.rejected = row.count;
      }

      return { status: 200 as const, body: { success: true, data: statsData } };
    } catch (error) {
      log.error('[adminVorlagenContract.getStats] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden der Statistiken.' },
      };
    }
  },

  approve: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      const userId = authedUser.id;
      if (!(await checkIsAdmin(userId, authedUser.email))) return FORBIDDEN;

      const { id } = args.params;
      const message = args.body.message?.trim() || null;
      const postgres = getPostgresInstance();

      const template = await postgres.queryOne(
        'SELECT id, user_id, title, metadata FROM user_templates WHERE id = $1',
        [id],
        { table: 'user_templates' }
      );

      if (!template) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Vorlage nicht gefunden.' },
        };
      }

      const existingMetadata = template.metadata || {};
      const updatedMetadata = {
        ...(existingMetadata as Record<string, unknown>),
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        ...(message ? { approval_message: message } : {}),
      };

      await postgres.query(
        `UPDATE user_templates
         SET status = 'published', is_private = false, metadata = $1, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(updatedMetadata), id],
        { table: 'user_templates' }
      );

      // Re-index so the vector payload reflects the published/public status.
      void enrichTemplate(id).catch((e) =>
        log.warn('[adminVorlagenContract.approve] enrichTemplate failed', e)
      );

      // Notify the submitter (in-app + email + push). Fires even when the
      // reviewing admin is the submitter — they still want the verdict.
      if (template.user_id) {
        const baseBody = `„${template.title}" ist jetzt in der Vorlagen-Galerie verfügbar.`;
        void createNotification({
          userId: template.user_id as string,
          type: 'template_approved',
          title: 'Deine Vorlage wurde freigegeben 🎉',
          body: message ? `${baseBody}\n\n${message}` : baseBody,
          actionUrl: '/vorlagen',
          metadata: { templateId: id, ...(message ? { approvalMessage: message } : {}) },
        }).catch((e) =>
          log.warn('[adminVorlagenContract.approve] createNotification failed', e)
        );
      }

      log.info(`[adminVorlagenContract] Vorlage ${id} approved by ${userId}`);
      return {
        status: 200 as const,
        body: { success: true, message: 'Vorlage wurde freigegeben.' },
      };
    } catch (error) {
      log.error('[adminVorlagenContract.approve] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Freigeben der Vorlage.' },
      };
    }
  },

  reject: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      const userId = authedUser.id;
      if (!(await checkIsAdmin(userId, authedUser.email))) return FORBIDDEN;

      const { id } = args.params;
      const reason = args.body.reason?.trim() || null;
      const postgres = getPostgresInstance();

      const template = await postgres.queryOne(
        'SELECT id, user_id, title, metadata FROM user_templates WHERE id = $1',
        [id],
        { table: 'user_templates' }
      );

      if (!template) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Vorlage nicht gefunden.' },
        };
      }

      const existingMetadata = template.metadata || {};
      const updatedMetadata = {
        ...(existingMetadata as Record<string, unknown>),
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason,
      };

      await postgres.query(
        `UPDATE user_templates
         SET status = 'rejected', metadata = $1, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(updatedMetadata), id],
        { table: 'user_templates' }
      );

      // Re-index so the vector payload reflects the rejected status.
      void enrichTemplate(id).catch((e) =>
        log.warn('[adminVorlagenContract.reject] enrichTemplate failed', e)
      );

      // Notify the submitter (in-app + email + push). Fires even when the
      // reviewing admin is the submitter — they still want the verdict.
      if (template.user_id) {
        void createNotification({
          userId: template.user_id as string,
          type: 'template_rejected',
          title: 'Deine Vorlage wurde nicht freigegeben',
          body: reason
            ? `„${template.title}" wurde abgelehnt: ${reason}`
            : `„${template.title}" wurde leider nicht freigegeben.`,
          metadata: { templateId: id, ...(reason ? { rejectionReason: reason } : {}) },
        }).catch((e) =>
          log.warn('[adminVorlagenContract.reject] createNotification failed', e)
        );
      }

      log.info(`[adminVorlagenContract] Vorlage ${id} rejected by ${userId}`);
      return { status: 200 as const, body: { success: true, message: 'Vorlage wurde abgelehnt.' } };
    } catch (error) {
      log.error('[adminVorlagenContract.reject] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Ablehnen der Vorlage.' },
      };
    }
  },
});

/**
 * Mount the ts-rest admin Vorlagen contract router onto an Express app.
 * Call from routes.ts BEFORE the legacy templates router so ts-rest routes
 * match first; unmatched paths fall through to the legacy router.
 *
 * requireAuth is already applied on the /api/auth prefix.
 */
export function mountAdminVorlagenContractRouter(app: Application): void {
  createExpressEndpoints(adminVorlagenContract, adminVorlagenContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'adminVorlagenContract'),
  });
}
