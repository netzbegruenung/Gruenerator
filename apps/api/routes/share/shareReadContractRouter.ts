/**
 * ts-rest contract router for /api/share read + management endpoints.
 *
 * Covers the auth-guarded read/management routes migrated from the legacy
 * shareController: publish, my/recent/my-images/my-videos, templates
 * (clone/list/get), devices, delete.
 *
 * Public + streaming routes (GET /:shareToken info, thumbnail, original,
 * preview, download) remain in shareFileRouter.ts. Auth is enforced per handler
 * via getUserId because the /api/share prefix uses optionalAuth.
 *
 * Mount BEFORE the legacy shareFileRouter so ts-rest matches its routes first.
 */

import { sharesReadContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { toCamelCase } from '../../utils/case.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import { getSharedMediaService } from './shareServices.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('sharesReadContract');

const UNAUTHORIZED = {
  status: 401 as const,
  body: { success: false as const, error: 'Authentication required' },
};

function getUserId(req: Request): string | undefined {
  return (req.user as UserProfile | undefined)?.id;
}

function getUserName(req: Request): string {
  const user = req.user as UserProfile | undefined;
  return user?.display_name || user?.email || 'Anonymous';
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

  cloneTemplate: async ({ req, params }) => {
    const userId = getUserId(req);
    if (!userId) return UNAUTHORIZED;
    try {
      const userName = getUserName(req);
      const { shareToken } = params;

      const service = await getSharedMediaService();
      const clonedShare = await service.cloneTemplate(shareToken, userId, userName);

      log.info(`Template ${shareToken} cloned to ${clonedShare.shareToken} by user ${userId}`);

      return {
        status: 200 as const,
        body: {
          success: true as const,
          share: clonedShare,
          message: 'Template successfully cloned',
        },
      };
    } catch (error) {
      log.error('Failed to clone template:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('not found')) {
        return {
          status: 404 as const,
          body: { success: false as const, error: 'Template not found' },
        };
      }
      if (errorMessage.includes('not accessible') || errorMessage.includes('private')) {
        return {
          status: 403 as const,
          body: { success: false as const, error: 'Template not accessible' },
        };
      }
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Failed to clone template' },
      };
    }
  },

  listTemplates: async ({ req, query }) => {
    const userId = getUserId(req);
    if (!userId) return UNAUTHORIZED;
    try {
      const service = await getSharedMediaService();
      const templates = await service.getTemplates(userId, query.visibility as string);
      return { status: 200 as const, body: { success: true as const, templates } };
    } catch (error) {
      log.error('Failed to get templates:', error);
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Failed to retrieve templates' },
      };
    }
  },

  getTemplate: async ({ req, params }) => {
    // Optional auth — public templates resolve without a session.
    const userId = getUserId(req);
    try {
      const { shareToken } = params;
      const service = await getSharedMediaService();
      const template = await service.getTemplateByToken(shareToken, userId);
      return { status: 200 as const, body: { success: true as const, template } };
    } catch (error) {
      log.error('Failed to get template by token:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('not found')) {
        return {
          status: 404 as const,
          body: { success: false as const, error: 'Template not found' },
        };
      }
      if (errorMessage.includes('not accessible') || errorMessage.includes('private')) {
        return {
          status: 403 as const,
          body: { success: false as const, error: 'Template not accessible' },
        };
      }
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Failed to retrieve template' },
      };
    }
  },

  listMyShares: async ({ req, query }) => {
    const userId = getUserId(req);
    if (!userId) return UNAUTHORIZED;
    try {
      const service = await getSharedMediaService();
      const shares = await service.getUserShares(userId, query.type || null, query.status || null);
      const count = await service.getUserShareCount(userId);
      return {
        status: 200 as const,
        body: {
          success: true as const,
          shares: toCamelCase(shares) as unknown[],
          count,
          limit: 50,
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
      return {
        status: 200 as const,
        body: {
          success: true as const,
          shares: toCamelCase(recentShares) as unknown[],
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

  listDevices: async ({ req }) => {
    const userId = getUserId(req);
    if (!userId) return UNAUTHORIZED;
    try {
      const { getUserDevices } = await import('../../services/pushNotificationService.js');
      const devices = await getUserDevices(userId);
      return { status: 200 as const, body: { success: true as const, devices } };
    } catch (error) {
      log.error('Failed to get devices:', error);
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Failed to get devices' },
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
