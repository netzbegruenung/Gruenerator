/**
 * ts-rest contract router for the link-shared view of a Grünerator-Vorlage.
 *
 * Mixed auth: mounted under `/api/vorlagen` with `optionalAuth`, so `req.user`
 * may be undefined. Per the getAuthedUser docs this router uses the explicit
 * `| undefined` guard instead of the throwing helper — an anonymous visitor is
 * an expected branch here, not a misconfiguration.
 *
 * Visibility is read off the frozen SNAPSHOT canvas, not off the template row.
 * That is deliberate: "using" a Vorlage clones the snapshot, so the snapshot's
 * `share_mode` is the thing that actually decides who may use it, and it is the
 * same column the document share dialog writes. The gallery axis
 * (`is_private` + `status`, admin-reviewed) is independent and is NOT consulted
 * here — sharing a Vorlage with a group or by link needs no review.
 */

import { sharedTemplateContract, type SharedTemplate } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { snapshotCanvasId } from '../../services/templates/grueneratorVorlage.js';
import { resolveSharedTemplateAccess } from '../../services/templates/sharedTemplateAccess.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application } from 'express';

const log = createLogger('sharedTemplateContractRouter');

interface TemplateRow {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  content_data: unknown;
  user_id: string | null;
  [key: string]: unknown;
}

interface SnapshotRow {
  share_mode: string | null;
  is_public: boolean | null;
  display_name: string | null;
  [key: string]: unknown;
}

const notFound = {
  status: 404 as const,
  body: { success: false as const, message: 'Diese Vorlage gibt es nicht (mehr).' },
};

const s = initServer();

export const sharedTemplateContractRouter = s.router(sharedTemplateContract, {
  getShared: async (args) => {
    try {
      const viewerId = (args.req.user as UserProfile | undefined)?.id ?? null;
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const template = await postgres.queryOne<TemplateRow>(
        `SELECT id, title, description, thumbnail_url, content_data, user_id
           FROM user_templates
          WHERE id = $1 AND type = 'template'`,
        [args.params.id],
        { table: 'user_templates' }
      );
      if (!template) return notFound;

      // Only Grünerator-Vorlagen carry a snapshot canvas. Canva links and
      // uploaded files have nothing to gate on and nothing to clone, so they
      // are simply not link-shareable.
      const canvasId = snapshotCanvasId(template.content_data);
      if (!canvasId) return notFound;

      const snapshot = await postgres.queryOne<SnapshotRow>(
        `SELECT cd.share_mode, cd.is_public, p.display_name
           FROM collaborative_documents cd
           LEFT JOIN profiles p ON p.id = cd.created_by
          WHERE cd.id = $1 AND cd.document_subtype = 'canvas' AND cd.is_deleted = false`,
        [canvasId],
        { table: 'collaborative_documents' }
      );
      if (!snapshot) return notFound;

      const access = resolveSharedTemplateAccess(snapshot, {
        isOwner: viewerId !== null && viewerId === template.user_id,
        isAnonymous: viewerId === null,
      });
      if (access.kind === 'hidden') return notFound;
      if (access.kind === 'needs_login') {
        return {
          status: 401 as const,
          body: {
            success: false as const,
            message: 'Diese Vorlage ist nur mit Anmeldung sichtbar.',
          },
        };
      }

      const data: SharedTemplate = {
        id: String(template.id),
        title: template.title,
        description: template.description,
        preview_image_url: template.thumbnail_url,
        canvas_id: canvasId,
        share_mode: access.shareMode,
        shared_by: snapshot.display_name,
      };

      return { status: 200 as const, body: { success: true as const, data } };
    } catch (error) {
      log.error('[sharedTemplateContract.getShared] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Vorlage konnte nicht geladen werden.' },
      };
    }
  },
});

/**
 * Mount the shared-Vorlage contract router. Call from routes.ts with
 * `optionalAuth` (never requireAuth) applied at the /api/vorlagen prefix, and
 * BEFORE the legacy vorlagenApi router.
 */
export function mountSharedTemplateContractRouter(app: Application): void {
  createExpressEndpoints(sharedTemplateContract, sharedTemplateContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'sharedTemplateContract'),
  });
}
