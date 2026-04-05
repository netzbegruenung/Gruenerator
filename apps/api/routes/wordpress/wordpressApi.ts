import { Router, type Request, type Response } from 'express';

import { requireAuth } from '../../middleware/authMiddleware.js';
import WordPressApiClient from '../../services/api-clients/wordpressApiClient.js';
import { WordPressSiteManager } from '../../utils/integrations/wordpress/index.js';
import { createLogger } from '../../utils/logger.js';
import { decryptCredential } from '../../utils/validation/encryption.js';

const log = createLogger('wordpress');

async function getClientForSite(userId: string, siteId: string): Promise<WordPressApiClient> {
  const site = await WordPressSiteManager.getSiteById(userId, siteId);
  const decryptedPassword = decryptCredential(site.app_password_encrypted);
  return WordPressApiClient.create(site.site_url, site.username, decryptedPassword);
}

interface ConnectSiteBody {
  siteUrl: string;
  username: string;
  appPassword: string;
  label?: string;
}

interface UpdateSiteBody {
  label?: string;
  is_active?: boolean;
  username?: string;
  appPassword?: string;
}

interface TestConnectionBody {
  siteUrl: string;
  username: string;
  appPassword: string;
}

interface PublishBody {
  siteId: string;
  title: string;
  content: string;
  status?: 'draft' | 'publish' | 'pending';
  excerpt?: string;
}

interface UpdatePostBody {
  title: string;
  content: string;
  status?: 'draft' | 'publish' | 'pending';
  excerpt?: string;
}

const router: Router = Router();

router.use(requireAuth as any);

/**
 * Get WordPress integration status
 * GET /api/wordpress/status
 */
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    log.debug('[WordPressApi] Getting WordPress status', { userId });

    const sites = await WordPressSiteManager.getSites(userId);

    res.json({
      connected: sites.length > 0,
      sitesCount: sites.length,
    });
  } catch (error) {
    const err = error as Error;
    log.error('[WordPressApi] Error getting WordPress status', { error: err.message });
    res.status(500).json({
      error: 'Failed to get WordPress status',
      message: err.message,
    });
  }
});

/**
 * List connected WordPress sites (credentials omitted)
 * GET /api/wordpress/sites
 */
router.get('/sites', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    log.debug('[WordPressApi] Getting sites', { userId });

    const sites = await WordPressSiteManager.getSites(userId);

    res.json({
      success: true,
      sites,
    });
  } catch (error) {
    const err = error as Error;
    log.error('[WordPressApi] Error getting sites', { error: err.message });
    res.status(500).json({
      error: 'Failed to get sites',
      message: err.message,
    });
  }
});

/**
 * Connect a new WordPress site
 * POST /api/wordpress/sites
 */
router.post('/sites', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { siteUrl, username, appPassword, label } = req.body as ConnectSiteBody;

    log.debug('[WordPressApi] Connecting new site', { userId, label });

    if (!siteUrl) {
      res.status(400).json({ error: 'Site URL is required' });
      return;
    }

    if (!username) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    if (!appPassword) {
      res.status(400).json({ error: 'Application password is required' });
      return;
    }

    const savedSite = await WordPressSiteManager.saveSite(
      userId,
      siteUrl,
      username,
      appPassword,
      label || ''
    );

    let connectionTest: { success: boolean; error: string | null } | null = null;
    try {
      const client = await WordPressApiClient.create(siteUrl, username, appPassword);
      const result = await client.testConnection();
      connectionTest = { success: result.success, error: result.error };
    } catch (testError) {
      const testErr = testError as Error;
      log.warn('[WordPressApi] Connection test failed for new site', {
        error: testErr.message,
        siteId: savedSite.id,
      });
      connectionTest = {
        success: false,
        error: testErr.message,
      };
    }

    res.status(201).json({
      success: true,
      site: savedSite,
      connectionTest,
    });
  } catch (error) {
    const err = error as Error;
    log.error('[WordPressApi] Error connecting site', { error: err.message });

    if (err.message.includes('already saved')) {
      res.status(409).json({
        error: 'Site already exists',
        message: err.message,
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to connect site',
      message: err.message,
    });
  }
});

/**
 * Update a WordPress site
 * PUT /api/wordpress/sites/:id
 */
router.put('/sites/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const siteId = req.params.id;
    const { label, is_active, username, appPassword } = req.body as UpdateSiteBody;

    log.debug('[WordPressApi] Updating site', { userId, siteId });

    if (!siteId) {
      res.status(400).json({ error: 'Site ID is required' });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (typeof label === 'string') {
      updates.label = label.trim() || null;
    }
    if (typeof is_active === 'boolean') {
      updates.is_active = is_active;
    }
    if (typeof username === 'string') {
      updates.username = username;
    }
    if (typeof appPassword === 'string') {
      updates.app_password = appPassword;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid updates provided' });
      return;
    }

    const updatedSite = await WordPressSiteManager.updateSite(userId, siteId, updates);

    res.json({
      success: true,
      site: updatedSite,
    });
  } catch (error) {
    const err = error as Error;
    log.error('[WordPressApi] Error updating site', { error: err.message });

    if (err.message.includes('not found')) {
      res.status(404).json({
        error: 'Site not found',
        message: err.message,
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to update site',
      message: err.message,
    });
  }
});

/**
 * Delete a WordPress site
 * DELETE /api/wordpress/sites/:id
 */
router.delete('/sites/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const siteId = req.params.id;

    log.debug('[WordPressApi] Deleting site', { userId, siteId });

    if (!siteId) {
      res.status(400).json({ error: 'Site ID is required' });
      return;
    }

    const result = await WordPressSiteManager.deleteSite(userId, siteId);

    res.json(result);
  } catch (error) {
    const err = error as Error;
    log.error('[WordPressApi] Error deleting site', { error: err.message });

    if (err.message.includes('not found')) {
      res.status(404).json({
        error: 'Site not found',
        message: err.message,
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to delete site',
      message: err.message,
    });
  }
});

/**
 * Test WordPress credentials
 * POST /api/wordpress/test-connection
 */
router.post('/test-connection', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { siteUrl, username, appPassword } = req.body as TestConnectionBody;

    log.debug('[WordPressApi] Testing WordPress connection', { userId });

    if (!siteUrl || !username || !appPassword) {
      res.status(400).json({ error: 'Site URL, username, and application password are required' });
      return;
    }

    const client = await WordPressApiClient.create(siteUrl, username, appPassword);
    const testResult = await client.testConnection();

    res.json(testResult);
  } catch (error) {
    const err = error as Error;
    log.error('[WordPressApi] Error testing connection', { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * Publish a post to WordPress
 * POST /api/wordpress/publish
 */
router.post('/publish', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { siteId, title, content, status, excerpt } = req.body as PublishBody;

    log.debug('[WordPressApi] Publishing post', { userId, siteId });

    if (!siteId) {
      res.status(400).json({ error: 'Site ID is required' });
      return;
    }

    if (!title || !content) {
      res.status(400).json({ error: 'Title and content are required' });
      return;
    }

    const client = await getClientForSite(userId, siteId);

    try {
      const result = await client.createPost(title, content, {
        status: status || 'draft',
        excerpt,
      });

      await WordPressSiteManager.updateLastUsed(userId, siteId);

      res.json({
        success: true,
        postId: result.id,
        editUrl: result.editUrl,
        viewUrl: result.viewUrl,
        status: result.status,
      });
    } catch (publishError) {
      const publishErr = publishError as Error;
      await WordPressSiteManager.updateLastError(userId, siteId, publishErr.message);
      throw publishError;
    }
  } catch (error) {
    const err = error as Error;
    log.error('[WordPressApi] Error publishing post', { error: err.message });

    if (err.message.includes('not found')) {
      res.status(404).json({
        error: 'Site not found',
        message: err.message,
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to publish post',
      message: err.message,
    });
  }
});

/**
 * List posts from a WordPress site
 * GET /api/wordpress/sites/:id/posts
 */
router.get(
  '/sites/:id/posts',
  async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const siteId = req.params.id;
      const status = req.query.status as string | null;
      const search = req.query.search as string | null;
      const per_page = req.query.per_page ? parseInt(req.query.per_page as string, 10) : 10;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;

      log.debug('[WordPressApi] Listing posts', { userId, siteId });

      if (!siteId) {
        res.status(400).json({ error: 'Site ID is required' });
        return;
      }

      const site = await WordPressSiteManager.getSiteById(userId, siteId);
      const decryptedPassword = decryptCredential(site.app_password_encrypted);

      const client = await WordPressApiClient.create(
        site.site_url,
        site.username,
        decryptedPassword
      );

      const params: Record<string, unknown> = { per_page, page };
      if (status) params.status = status;
      if (search) params.search = search;

      const result = await client.getPosts(params as any);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[WordPressApi] Error listing posts', { error: err.message });

      if (err.message.includes('not found')) {
        res.status(404).json({
          error: 'Site not found',
          message: err.message,
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to list posts',
        message: err.message,
      });
    }
  }
);

/**
 * Get a single post from a WordPress site
 * GET /api/wordpress/sites/:id/posts/:postId
 */
router.get(
  '/sites/:id/posts/:postId',
  async (req: Request<{ id: string; postId: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const siteId = req.params.id;
      const postId = parseInt(req.params.postId, 10);

      log.debug('[WordPressApi] Getting post', { userId, siteId, postId });

      if (!siteId) {
        res.status(400).json({ error: 'Site ID is required' });
        return;
      }

      if (isNaN(postId)) {
        res.status(400).json({ error: 'Invalid post ID' });
        return;
      }

      const site = await WordPressSiteManager.getSiteById(userId, siteId);
      const decryptedPassword = decryptCredential(site.app_password_encrypted);

      const client = await WordPressApiClient.create(
        site.site_url,
        site.username,
        decryptedPassword
      );

      const post = await client.getPost(postId);

      res.json({
        success: true,
        post,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[WordPressApi] Error getting post', { error: err.message });

      if (err.message.includes('not found')) {
        res.status(404).json({
          error: 'Not found',
          message: err.message,
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to get post',
        message: err.message,
      });
    }
  }
);

/**
 * Update a post on a WordPress site
 * PUT /api/wordpress/sites/:id/posts/:postId
 */
router.put(
  '/sites/:id/posts/:postId',
  async (req: Request<{ id: string; postId: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const siteId = req.params.id;
      const postId = parseInt(req.params.postId, 10);
      const { title, content, status, excerpt } = req.body as UpdatePostBody;

      log.debug('[WordPressApi] Updating post', { userId, siteId, postId });

      if (!siteId) {
        res.status(400).json({ error: 'Site ID is required' });
        return;
      }

      if (isNaN(postId)) {
        res.status(400).json({ error: 'Invalid post ID' });
        return;
      }

      if (!title || !content) {
        res.status(400).json({ error: 'Title and content are required' });
        return;
      }

      const site = await WordPressSiteManager.getSiteById(userId, siteId);
      const decryptedPassword = decryptCredential(site.app_password_encrypted);

      const client = await WordPressApiClient.create(
        site.site_url,
        site.username,
        decryptedPassword
      );

      const result = await client.updatePost(postId, title, content, {
        status,
        excerpt,
      });

      await WordPressSiteManager.updateLastUsed(userId, siteId);

      res.json({
        success: true,
        postId: result.id,
        editUrl: result.editUrl,
        viewUrl: result.viewUrl,
        status: result.status,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[WordPressApi] Error updating post', { error: err.message });

      if (err.message.includes('not found')) {
        res.status(404).json({
          error: 'Not found',
          message: err.message,
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to update post',
        message: err.message,
      });
    }
  }
);

/**
 * List categories from a WordPress site
 * GET /api/wordpress/sites/:id/categories
 */
router.get(
  '/sites/:id/categories',
  async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const siteId = req.params.id;

      log.debug('[WordPressApi] Getting categories', { userId, siteId });

      if (!siteId) {
        res.status(400).json({ error: 'Site ID is required' });
        return;
      }

      const site = await WordPressSiteManager.getSiteById(userId, siteId);
      const decryptedPassword = decryptCredential(site.app_password_encrypted);

      const client = await WordPressApiClient.create(
        site.site_url,
        site.username,
        decryptedPassword
      );

      const categories = await client.getCategories();

      res.json({
        success: true,
        categories,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[WordPressApi] Error getting categories', { error: err.message });

      if (err.message.includes('not found')) {
        res.status(404).json({
          error: 'Site not found',
          message: err.message,
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to get categories',
        message: err.message,
      });
    }
  }
);

export default router;
