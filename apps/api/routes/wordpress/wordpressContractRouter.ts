/**
 * ts-rest contract router for /api/wordpress
 *
 * Covers the validateBody-guarded endpoints in wordpressApi.ts:
 *   POST /api/wordpress/sites         — connect a WordPress site
 *   PUT  /api/wordpress/sites/:id     — update a connected site
 *   POST /api/wordpress/test-connection
 *   POST /api/wordpress/publish       — create a post
 *   PUT  /api/wordpress/sites/:id/posts/:postId — update a post
 *
 * Mount BEFORE the legacy wordpressApiRouter in routes.ts so ts-rest
 * matches its own routes first; unmatched GET/DELETE paths fall through.
 *
 * Authentication: all routes require authentication — router.use(requireAuth)
 * is already in wordpressApi.ts, and requireAuth is NOT re-applied here to
 * avoid double-checking. The contract mounts after the legacy router's
 * requireAuth runs because the legacy router fires its middleware when the
 * legacy route is matched. The contract router runs first, so we call
 * getUserId() with explicit `| undefined` handling to be safe.
 */

import { wordpressContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import WordPressApiClient from '../../services/api-clients/wordpressApiClient.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { WordPressSiteManager } from '../../utils/integrations/wordpress/index.js';
import { createLogger } from '../../utils/logger.js';
import { decryptCredential } from '../../utils/validation/encryption.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('wordpressContract');

function getUserId(req: Request): string | undefined {
  return (req.user as UserProfile | undefined)?.id;
}

async function getClientForSite(userId: string, siteId: string): Promise<WordPressApiClient> {
  const site = await WordPressSiteManager.getSiteById(userId, siteId);
  const decryptedPassword = decryptCredential(site.app_password_encrypted);
  return WordPressApiClient.create(site.site_url, site.username, decryptedPassword);
}

const s = initServer();

export const wordpressContractRouter = s.router(wordpressContract, {
  connectSite: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Unauthorized' } };
      }

      const { siteUrl, username, appPassword, label } = args.body;

      const savedSite = await WordPressSiteManager.saveSite(
        userId,
        siteUrl,
        username,
        appPassword,
        label ?? ''
      );

      let connectionTest: { success: boolean; error: string | null } | null = null;
      try {
        const client = await WordPressApiClient.create(siteUrl, username, appPassword);
        const result = await client.testConnection();
        connectionTest = { success: result.success, error: result.error ?? null };
      } catch (testError) {
        const testErr = testError as Error;
        log.warn('[wordpressContract] Connection test failed for new site', {
          error: testErr.message,
          siteId: savedSite.id,
        });
        connectionTest = { success: false, error: testErr.message };
      }

      return {
        status: 201 as const,
        body: { success: true, site: savedSite, connectionTest },
      };
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('already saved')) {
        return {
          status: 409 as const,
          body: { error: 'Site already exists', message: err.message },
        };
      }
      log.error('[wordpressContract.connectSite] Error:', { error });
      return { status: 500 as const, body: { error: 'Failed to connect site' } };
    }
  },

  updateSite: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Unauthorized' } };
      }

      const siteId = args.params.id;
      const { label, is_active, username, appPassword } = args.body;

      const updates: Record<string, unknown> = {};
      if (typeof label === 'string') updates.label = label.trim() || null;
      if (typeof is_active === 'boolean') updates.is_active = is_active;
      if (typeof username === 'string') updates.username = username;
      if (typeof appPassword === 'string') updates.app_password = appPassword;

      if (Object.keys(updates).length === 0) {
        return { status: 400 as const, body: { error: 'No valid updates provided' } };
      }

      const updatedSite = await WordPressSiteManager.updateSite(userId, siteId, updates);
      return { status: 200 as const, body: { success: true, site: updatedSite } };
    } catch (error) {
      log.error('[wordpressContract.updateSite] Error:', { error });
      return { status: 500 as const, body: { error: 'Failed to update site' } };
    }
  },

  testConnection: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Unauthorized' } };
      }

      const { siteUrl, username, appPassword } = args.body;
      const client = await WordPressApiClient.create(siteUrl, username, appPassword);
      const result = await client.testConnection();
      return { status: 200 as const, body: result };
    } catch (error) {
      log.error('[wordpressContract.testConnection] Error:', { error });
      return { status: 500 as const, body: { error: 'Connection test failed' } };
    }
  },

  publishPost: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Unauthorized' } };
      }

      const { siteId, title, content, status, excerpt } = args.body;
      const client = await getClientForSite(userId, siteId);

      try {
        const result = await client.createPost(title, content, {
          status: status ?? 'draft',
          ...(excerpt != null && { excerpt }),
        });
        await WordPressSiteManager.updateLastUsed(userId, siteId);
        return {
          status: 200 as const,
          body: {
            success: true,
            postId: result.id,
            editUrl: result.editUrl,
            viewUrl: result.viewUrl,
            status: result.status,
          },
        };
      } catch (publishError) {
        await WordPressSiteManager.updateLastError(userId, siteId, (publishError as Error).message);
        throw publishError;
      }
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      const status = err.statusCode || (err.message?.includes('not found') ? 404 : 500);
      log.error('[wordpressContract.publishPost] Error:', { error });
      if (status === 404) {
        return { status: 404 as const, body: { error: 'Failed to publish post' } };
      }
      return { status: 500 as const, body: { error: 'Failed to publish post' } };
    }
  },

  updatePost: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Unauthorized' } };
      }

      const siteId = args.params.id;
      const postId = parseInt(args.params.postId, 10);
      const { title, content, status, excerpt } = args.body;

      if (isNaN(postId)) {
        return { status: 400 as const, body: { error: 'Invalid post ID' } };
      }

      const client = await getClientForSite(userId, siteId);
      const result = await client.updatePost(postId, title, content, {
        ...(status != null && { status }),
        ...(excerpt != null && { excerpt }),
      });
      await WordPressSiteManager.updateLastUsed(userId, siteId);

      return {
        status: 200 as const,
        body: {
          success: true,
          postId: result.id,
          editUrl: result.editUrl,
          viewUrl: result.viewUrl,
          status: result.status,
        },
      };
    } catch (error) {
      log.error('[wordpressContract.updatePost] Error:', { error });
      return { status: 500 as const, body: { error: 'Failed to update post' } };
    }
  },
});

/**
 * Mount the WordPress contract router onto an Express app.
 * Call from routes.ts BEFORE the legacy wordpressApiRouter.
 *
 * `requireAuth` is applied inside the legacy router (router.use(requireAuth))
 * but since we mount the contract router BEFORE the legacy router, apply
 * requireAuth at the prefix in routes.ts to guarantee authentication.
 */
export function mountWordpressContractRouter(app: Application): void {
  createExpressEndpoints(wordpressContract, wordpressContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'wordpressContract'),
  });
}
