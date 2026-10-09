/**
 * ts-rest contract router for template (Vorlagen) likes & favorites.
 *
 * Mounted at /api/auth/templates (see routes.ts). Likes reuse the generic
 * EntityLikesService; favorites use EntityFavoritesService. Both work on ANY
 * Vorlage — a user template (UUID) or a Grünerator catalogue entry (string id)
 * — keyed on the gallery item id; liking/favoriting checks it exists
 * (`templateExistsFor`), removing does not, so stale ids stay removable. A fresh like on a *community* template (a real
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
import { extractLocaleFromRequest } from '../../../services/localization/index.js';
import { createNotification } from '../../../services/notifications/NotificationService.js';
import { listPopularVorlagen } from '../../../services/templateInteractions/popularVorlagen.js';
import { getTemplateEngagement } from '../../../services/templateInteractions/templateEngagement.js';
import { templateExistsFor } from '../../../services/templateInteractions/templateTarget.js';
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
      `SELECT user_id, title FROM user_templates WHERE id = $1 AND deleted_at IS NULL`,
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

const NOT_FOUND = {
  status: 404 as const,
  body: { success: false as const, message: 'Vorlage nicht gefunden.' },
};

/** Upper bound for ids per engagement request (one gallery page plus the catalogue). */
const MAX_ENGAGEMENT_IDS = 300;

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

  getTemplateEngagement: async (args) => {
    try {
      const ids = args.query.ids
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, MAX_ENGAGEMENT_IDS);
      const items = await getTemplateEngagement(ids);
      return { status: 200 as const, body: { success: true as const, items } };
    } catch (error) {
      log.error('[templateInteractionsContract.getTemplateEngagement] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Laden der Likes.' },
      };
    }
  },

  listPopularVorlagen: async (args) => {
    try {
      const locale = extractLocaleFromRequest(args.req) === 'de-AT' ? 'de-AT' : 'de-DE';
      const items = await listPopularVorlagen(locale, args.query.limit);
      return { status: 200 as const, body: { success: true as const, items } };
    } catch (error) {
      log.error('[templateInteractionsContract.listPopularVorlagen] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Laden der beliebten Vorlagen.' },
      };
    }
  },

  likeTemplate: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const templateId = args.params.id;
      if (!(await templateExistsFor(userId, templateId))) return NOT_FOUND;

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
      if (!(await templateExistsFor(userId, args.params.id))) return NOT_FOUND;
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
