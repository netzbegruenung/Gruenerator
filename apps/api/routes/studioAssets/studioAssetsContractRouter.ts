/**
 * ts-rest router for the Studio shop (Sticker and Hintergründe).
 *
 * requireAuth and the rate limiters are applied at the /api/studio-assets
 * prefix in routes.ts. Liking and saving check that the caller may see the
 * asset; removing a like or a bookmark does not, so stale ones stay removable.
 */
import { studioAssetsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  favoriteEntity,
  unfavoriteEntity,
} from '../../services/entityFavorites/EntityFavoritesService.js';
import { likeEntity, unlikeEntity } from '../../services/entityLikes/EntityLikesService.js';
import { extractLocaleFromRequest } from '../../services/localization/index.js';
import {
  createStudioAsset,
  isStudioAssetVisible,
  listStudioAssets,
  removeStudioAsset,
  updateStudioAsset,
  type StudioAssetFailure,
} from '../../services/studioAssets/studioAssetsService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('studioAssetsContractRouter');

const NOT_FOUND = {
  status: 404 as const,
  body: { success: false as const, message: 'Element nicht gefunden.' },
};

const serverError = (message: string) => ({
  status: 500 as const,
  body: { success: false as const, message },
});

const failure = <S extends number>(f: StudioAssetFailure<S>) => ({
  status: f.status,
  body: { success: false as const, message: f.message },
});

const s = initServer();

export const studioAssetsContractRouter = s.router(studioAssetsContract, {
  list: async ({ req, query }) => {
    try {
      const userId = getAuthedUser(req).id;
      const locale = extractLocaleFromRequest(req) === 'de-AT' ? 'de-AT' : 'de-DE';
      const body = await listStudioAssets(userId, locale, query);
      return { status: 200 as const, body };
    } catch (error) {
      log.error('[studioAssetsContract.list] Error:', error);
      return serverError('Fehler beim Laden der Sticker und Hintergründe.');
    }
  },

  create: async ({ req, body }) => {
    try {
      const result = await createStudioAsset(getAuthedUser(req).id, body);
      if (!result.ok) return failure(result);
      return { status: 201 as const, body: result.value };
    } catch (error) {
      log.error('[studioAssetsContract.create] Error:', error);
      return serverError('Speichern fehlgeschlagen.');
    }
  },

  update: async ({ req, params, body }) => {
    try {
      const result = await updateStudioAsset(getAuthedUser(req).id, params.id, body);
      if (!result.ok) return failure(result);
      return { status: 200 as const, body: result.value };
    } catch (error) {
      log.error('[studioAssetsContract.update] Error:', error);
      return serverError('Speichern fehlgeschlagen.');
    }
  },

  remove: async ({ req, params }) => {
    try {
      if (!(await removeStudioAsset(getAuthedUser(req).id, params.id))) return NOT_FOUND;
      return { status: 200 as const, body: { trashed: true as const } };
    } catch (error) {
      log.error('[studioAssetsContract.remove] Error:', error);
      return serverError('Löschen fehlgeschlagen.');
    }
  },

  like: async ({ req, params }) => {
    try {
      const userId = getAuthedUser(req).id;
      if (!(await isStudioAssetVisible(userId, params.id))) return NOT_FOUND;
      const result = await likeEntity({ userId, entityType: 'studio_asset', entityId: params.id });
      return { status: 200 as const, body: { liked: true, likesCount: result.count } };
    } catch (error) {
      log.error('[studioAssetsContract.like] Error:', error);
      return serverError('Like fehlgeschlagen.');
    }
  },

  unlike: async ({ req, params }) => {
    try {
      const userId = getAuthedUser(req).id;
      const result = await unlikeEntity({
        userId,
        entityType: 'studio_asset',
        entityId: params.id,
      });
      return { status: 200 as const, body: { liked: false, likesCount: result.count } };
    } catch (error) {
      log.error('[studioAssetsContract.unlike] Error:', error);
      return serverError('Like entfernen fehlgeschlagen.');
    }
  },

  favorite: async ({ req, params }) => {
    try {
      const userId = getAuthedUser(req).id;
      if (!(await isStudioAssetVisible(userId, params.id))) return NOT_FOUND;
      await favoriteEntity({ userId, entityType: 'studio_asset', entityId: params.id });
      return { status: 200 as const, body: { favorited: true } };
    } catch (error) {
      log.error('[studioAssetsContract.favorite] Error:', error);
      return serverError('Merken fehlgeschlagen.');
    }
  },

  unfavorite: async ({ req, params }) => {
    try {
      const userId = getAuthedUser(req).id;
      await unfavoriteEntity({ userId, entityType: 'studio_asset', entityId: params.id });
      return { status: 200 as const, body: { favorited: false } };
    } catch (error) {
      log.error('[studioAssetsContract.unfavorite] Error:', error);
      return serverError('Entfernen aus „Gemerkt" fehlgeschlagen.');
    }
  },
});

export function mountStudioAssetsContractRouter(app: Application): void {
  createExpressEndpoints(studioAssetsContract, studioAssetsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'studioAssetsContract'),
  });
}
