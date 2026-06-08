/**
 * ts-rest contract router for template (Vorlagen) likes & favorites.
 *
 * Mounted at /api/auth/templates (see routes.ts). Likes reuse the generic
 * EntityLikesService; favorites use EntityFavoritesService. Both work on ANY
 * gallery item (system template, system file, or published user vorlage) keyed
 * on the gallery item id. A fresh like on a *community* template (a real
 * user_templates row) notifies its creator; system templates have no row and so
 * skip the notification.
 *
 * requireAuth is applied at the /api/auth/templates prefix in routes.ts.
 */

import { templateInteractionsContract, type GalleryTemplate } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import {
  favoriteEntity,
  getFavoritedEntityIdsForUser,
  unfavoriteEntity,
} from '../../../services/entityFavorites/EntityFavoritesService.js';
import {
  getLikedEntityIdsForUser,
  likeEntity,
  unlikeEntity,
} from '../../../services/entityLikes/EntityLikesService.js';
import { createNotification } from '../../../services/notifications/NotificationService.js';
import { getProfileService } from '../../../services/user/ProfileService.js';
import { logContractValidationError } from '../../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../../utils/getAuthedUser.js';
import { createLogger } from '../../../utils/logger.js';

import { attachLikeCounts, buildGalleryTemplates } from './templateGallery.js';

import type { Application } from 'express';

const log = createLogger('templateInteractionsContractRouter');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Best-effort notification to the creator of a freshly-liked community template.
 * No-op for system templates / files (their ids are not user_templates UUIDs)
 * and self-likes.
 */
async function notifyTemplateCreatorOnLike(templateId: string, likerId: string): Promise<void> {
  if (!UUID_RE.test(templateId)) return; // system template/file — no owner row
  try {
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    const row = await postgres.queryOne<{ user_id: string | null; title: string | null }>(
      `SELECT user_id, title FROM user_templates WHERE id = $1`,
      [templateId],
      { table: 'user_templates' }
    );
    if (!row?.user_id || row.user_id === likerId) return;

    const profile = await getProfileService().getProfileById(likerId);
    const likerName = profile?.display_name?.trim() || 'Jemand';
    await createNotification({
      userId: row.user_id,
      type: 'template_liked',
      title: `${likerName} mag deine Vorlage`,
      body: row.title ?? undefined,
      metadata: { templateId, templateTitle: row.title, likerId, likerName },
      actionUrl: `/vorlagen`,
      groupKey: `template:${templateId}:liked`,
    });
  } catch (err) {
    log.warn('[templateInteractionsContract] like notification failed', err);
  }
}

const s = initServer();

export const templateInteractionsContractRouter = s.router(templateInteractionsContract, {
  listMyLikedTemplates: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const liked_ids = await getLikedEntityIdsForUser({ userId, entityType: 'template' });
      return { status: 200 as const, body: { success: true, liked_ids } };
    } catch (error) {
      log.error('[templateInteractionsContract.listMyLikedTemplates] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden der Likes.' },
      };
    }
  },

  listMyFavoriteTemplates: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const favorite_ids = await getFavoritedEntityIdsForUser({ userId, entityType: 'template' });

      if (favorite_ids.length === 0) {
        return {
          status: 200 as const,
          body: { success: true, favorite_ids: [], templates: [] },
        };
      }

      const favoriteSet = new Set(favorite_ids);
      const gallery = await buildGalleryTemplates();
      // The gallery is a loose Record merge; each item carries an `id`, matching
      // the passthrough GalleryTemplate contract shape.
      const templates = gallery.filter((t) => favoriteSet.has(String(t.id))) as GalleryTemplate[];
      await attachLikeCounts(templates);

      return {
        status: 200 as const,
        body: { success: true, favorite_ids, templates },
      };
    } catch (error) {
      log.error('[templateInteractionsContract.listMyFavoriteTemplates] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden der Favoriten.' },
      };
    }
  },

  likeTemplate: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const templateId = args.params.id;

      const result = await likeEntity({ userId, entityType: 'template', entityId: templateId });
      if (result.createdNew) {
        void notifyTemplateCreatorOnLike(templateId, userId);
      }

      return {
        status: 200 as const,
        body: { success: true, liked: true, count: result.count },
      };
    } catch (error) {
      log.error('[templateInteractionsContract.likeTemplate] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Like fehlgeschlagen.' },
      };
    }
  },

  unlikeTemplate: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const templateId = args.params.id;
      const result = await unlikeEntity({ userId, entityType: 'template', entityId: templateId });
      return {
        status: 200 as const,
        body: { success: true, liked: false, count: result.count },
      };
    } catch (error) {
      log.error('[templateInteractionsContract.unlikeTemplate] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Like entfernen fehlgeschlagen.' },
      };
    }
  },

  favoriteTemplate: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      await favoriteEntity({ userId, entityType: 'template', entityId: args.params.id });
      return { status: 200 as const, body: { success: true, favorited: true } };
    } catch (error) {
      log.error('[templateInteractionsContract.favoriteTemplate] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Favorit speichern fehlgeschlagen.' },
      };
    }
  },

  unfavoriteTemplate: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      await unfavoriteEntity({ userId, entityType: 'template', entityId: args.params.id });
      return { status: 200 as const, body: { success: true, favorited: false } };
    } catch (error) {
      log.error('[templateInteractionsContract.unfavoriteTemplate] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Favorit entfernen fehlgeschlagen.' },
      };
    }
  },
});

/**
 * Mount the ts-rest template-interactions contract router. Call from routes.ts
 * BEFORE the legacy authRouter so contract routes match first. requireAuth is
 * applied at the /api/auth/templates prefix.
 */
export function mountTemplateInteractionsContractRouter(app: Application): void {
  createExpressEndpoints(templateInteractionsContract, templateInteractionsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'templateInteractionsContract'),
  });
}
