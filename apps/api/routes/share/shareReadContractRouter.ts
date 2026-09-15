/**
 * ts-rest contract router for /api/share read + management endpoints.
 *
 * Covers the auth-guarded read/management routes migrated from the legacy
 * shareController: publish, my/recent/my-images/my-videos, devices, delete.
 *
 * Public + streaming routes (GET /:shareToken info, thumbnail, original,
 * preview, download) remain in shareFileRouter.ts. Auth is enforced per handler
 * via getUserId because the /api/share prefix uses optionalAuth.
 *
 * Mount BEFORE the legacy shareFileRouter so ts-rest matches its routes first.
 */

import { sharesReadContract, type ShareListItem } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { USER_SHARES_MAX_LIMIT } from '../../services/sharedMediaFilters.js';
import { toCamelCase } from '../../utils/case.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import { getSharedMediaService } from './shareServices.js';

import type { UserProfile } from '../../services/user/types.js';
import type { SharedMediaRow } from '../../types/media.js';
import type { Application, Request } from 'express';

const log = createLogger('sharesReadContract');

const UNAUTHORIZED = {
  status: 401 as const,
  body: { success: false as const, error: 'Authentication required' },
};

function getUserId(req: Request): string | undefined {
  return (req.user as UserProfile | undefined)?.id;
}

/**
 * A `shared_media` row as the list contract declares it.
 *
 * Written out column by column instead of running the row through the generic
 * `toCamelCase`: that helper takes `unknown` and returns `unknown`, so every
 * call site ended in an `as unknown[]` and the contract could promise a shape
 * nothing checked. It is also what hid the original bug — `toCamelCase` used to
 * rebuild `created_at` (a `Date`) as `{}`, and no type anywhere objected.
 *
 * Only the columns `getUserShares` actually SELECTs appear here.
 */
function toShareListItem(row: SharedMediaRow): ShareListItem {
  return {
    id: row.id,
    shareToken: row.share_token,
    mediaType: row.media_type,
    title: row.title,
    thumbnailPath: row.thumbnail_path,
    fileSize: row.file_size,
    duration: row.duration,
    imageType: row.image_type,
    // NOT NULL DEFAULT '{}' in Postgres; the row type is wider than the column.
    imageMetadata: row.image_metadata ?? {},
    status: row.status,
    downloadCount: row.download_count,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    contentOrigin: row.content_origin,
  };
}

const s = initServer();

export const shareReadContractRouter = s.router(sharesReadContract, {
  publishShare: async ({ req, params }) => {
    const userId = getUserId(req);
    if (!userId) return UNAUTHORIZED;
    try {
      const { shareToken } = params;
      const service = await getSharedMediaService();
      const share = await service.getShareByToken(shareToken);

      if (!share) {
        return {
          status: 404 as const,
          body: { success: false as const, error: 'Share nicht gefunden' },
        };
      }
      if (share.user_id !== userId) {
        return {
          status: 403 as const,
          body: { success: false as const, error: 'Nicht berechtigt' },
        };
      }

      const pg = (await import('../../database/services/PostgresService.js')).getPostgresInstance();
      await pg.query('UPDATE shared_media SET status = $1 WHERE share_token = $2', [
        'ready',
        shareToken,
      ]);

      log.info(`Share ${shareToken} published by user ${userId}`);

      return {
        status: 200 as const,
        body: {
          success: true as const,
          share: {
            shareToken: share.share_token,
            shareUrl: `/share/${shareToken}`,
            createdAt: share.created_at,
            mediaType: share.media_type as 'image' | 'video',
            status: 'ready',
          },
        },
      };
    } catch (error) {
      log.error('Failed to publish share:', error);
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Share konnte nicht veröffentlicht werden' },
      };
    }
  },

  listMyShares: async ({ req, query }) => {
    const userId = getUserId(req);
    if (!userId) return UNAUTHORIZED;
    try {
      const service = await getSharedMediaService();
      const shares = await service.getUserShares(userId, query.type || null, query.status || null);
      // `count` describes THIS list and nothing else (#2986). It used to be an
      // account-wide number — first every row in the table including internal
      // artifacts, then the Mediathek quota — sitting next to a list filtered by
      // `type`, by `status`, and by both provenance columns. Any consumer
      // pairing the two got a mismatch that grew with the account: one
      // non-library thumbnail row per canvas document.
      //
      // The endpoint has no offset, so there is no total worth reporting
      // separately: `count === limit` is how a caller learns it was truncated.
      // The quota lives on `GET /api/media`, which is where the Mediathek reads
      // it and where it is not next to a filtered list.
      return {
        status: 200 as const,
        body: {
          success: true as const,
          shares: shares.map(toShareListItem),
          count: shares.length,
          limit: USER_SHARES_MAX_LIMIT,
        },
      };
    } catch (error) {
      log.error('Failed to get user shares:', error);
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Geteilte Medien konnten nicht geladen werden' },
      };
    }
  },

  recentShares: async ({ req, query }) => {
    const userId = getUserId(req);
    if (!userId) return UNAUTHORIZED;
    const limit = Math.min(parseInt(query.limit ?? '', 10) || 6, 20);
    try {
      let service;
      try {
        service = await getSharedMediaService();
      } catch (initError) {
        log.warn('SharedMediaService unavailable, returning empty result:', initError);
        return {
          status: 200 as const,
          body: { success: true as const, shares: [], count: 0, limit },
        };
      }

      const allShares = await service.getUserShares(userId, 'image');
      const recentShares = allShares.slice(0, limit);
      // Same contract as listMyShares: `count` is this page, `limit` the cap
      // that produced it.
      return {
        status: 200 as const,
        body: {
          success: true as const,
          shares: recentShares.map(toShareListItem),
          count: recentShares.length,
          limit,
        },
      };
    } catch (error) {
      log.error('Failed to get recent shares:', error);
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Letzte Bilder konnten nicht geladen werden' },
      };
    }
  },

  listMyImages: async ({ req }) => {
    const userId = getUserId(req);
    if (!userId) return UNAUTHORIZED;
    try {
      const service = await getSharedMediaService();
      const shares = await service.getUserShares(userId, 'image');
      return {
        status: 200 as const,
        body: { success: true as const, shares: toCamelCase(shares) as unknown[] },
      };
    } catch (error) {
      log.error('Failed to get user image shares:', error);
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Bilder konnten nicht geladen werden' },
      };
    }
  },

  listMyVideos: async ({ req }) => {
    const userId = getUserId(req);
    if (!userId) return UNAUTHORIZED;
    try {
      const service = await getSharedMediaService();
      const shares = await service.getUserShares(userId, 'video');
      return {
        status: 200 as const,
        body: { success: true as const, shares: toCamelCase(shares) as unknown[] },
      };
    } catch (error) {
      log.error('Failed to get user video shares:', error);
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Videos konnten nicht geladen werden' },
      };
    }
  },

  deleteShare: async ({ req, params }) => {
    const userId = getUserId(req);
    if (!userId) return UNAUTHORIZED;
    try {
      const { shareToken } = params;
      const service = await getSharedMediaService();
      await service.deleteShare(userId, shareToken);

      log.info(`Share deleted: ${shareToken} by user ${userId}`);
      return {
        status: 200 as const,
        body: { success: true as const, message: 'Geteiltes Medium gelöscht' },
      };
    } catch (error) {
      log.error('Failed to delete share:', error);
      const message = (error as Error).message;
      if (message.includes('not found') || message.includes('not owned')) {
        return {
          status: 404 as const,
          body: {
            success: false as const,
            error: 'Geteiltes Medium nicht gefunden oder keine Berechtigung',
          },
        };
      }
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Geteiltes Medium konnte nicht gelöscht werden' },
      };
    }
  },

  renameShare: async ({ req, params, body }) => {
    const userId = getUserId(req);
    if (!userId) return UNAUTHORIZED;
    try {
      const { shareToken } = params;
      const service = await getSharedMediaService();
      await service.renameShare(userId, shareToken, body.title.trim());

      log.info(`Share renamed: ${shareToken} by user ${userId}`);
      return {
        status: 200 as const,
        body: { success: true as const, message: 'Geteiltes Medium umbenannt' },
      };
    } catch (error) {
      log.error('Failed to rename share:', error);
      const message = (error as Error).message;
      if (message.includes('not found') || message.includes('not owned')) {
        return {
          status: 404 as const,
          body: {
            success: false as const,
            error: 'Geteiltes Medium nicht gefunden oder keine Berechtigung',
          },
        };
      }
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Geteiltes Medium konnte nicht umbenannt werden' },
      };
    }
  },
});

/**
 * Mount the read contract router. Call from routes.ts BEFORE the legacy
 * shareFileRouter so ts-rest matches the migrated routes first.
 */
export function mountShareReadContractRouter(app: Application): void {
  createExpressEndpoints(sharesReadContract, shareReadContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'sharesReadContract'),
  });
}
