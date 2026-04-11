import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import WordPressApiClient, {
  type GetPostsParams,
} from '../../services/api-clients/wordpressApiClient.js';
import { WordPressSiteManager } from '../../utils/integrations/wordpress/index.js';
import { createLogger } from '../../utils/logger.js';
import { decryptCredential } from '../../utils/validation/encryption.js';

const log = createLogger('wordpress');

function getUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  return userId;
}

async function getClientForSite(userId: string, siteId: string): Promise<WordPressApiClient> {
  const site = await WordPressSiteManager.getSiteById(userId, siteId);
  const decryptedPassword = decryptCredential(site.app_password_encrypted);
  return WordPressApiClient.create(site.site_url, site.username, decryptedPassword);
}

function handleError(res: Response, error: unknown, fallbackMessage: string): void {
  const err = error as Error & { statusCode?: number };
  const status = err.statusCode || (err.message?.includes('not found') ? 404 : 500);
  log.error(`[WordPressApi] ${fallbackMessage}`, { error: err.message });
  res.status(status).json({ error: fallbackMessage, message: err.message });
}

const connectSiteBodySchema = z.object({
  siteUrl: z.string(),
  username: z.string(),
  appPassword: z.string(),
  label: z.string().optional(),
});
type ConnectSiteBody = z.infer<typeof connectSiteBodySchema>;

const updateSiteBodySchema = z.object({
  label: z.string().optional(),
  is_active: z.boolean().optional(),
  username: z.string().optional(),
  appPassword: z.string().optional(),
});
type UpdateSiteBody = z.infer<typeof updateSiteBodySchema>;

const testConnectionBodySchema = z.object({
  siteUrl: z.string(),
  username: z.string(),
  appPassword: z.string(),
});
type TestConnectionBody = z.infer<typeof testConnectionBodySchema>;

const publishBodySchema = z.object({
  siteId: z.string(),
  title: z.string(),
  content: z.string(),
  status: z.enum(['draft', 'publish', 'pending']).optional(),
  excerpt: z.string().optional(),
});
type PublishBody = z.infer<typeof publishBodySchema>;

const updatePostBodySchema = z.object({
  title: z.string(),
  content: z.string(),
  status: z.enum(['draft', 'publish', 'pending']).optional(),
  excerpt: z.string().optional(),
});
type UpdatePostBody = z.infer<typeof updatePostBodySchema>;

const router: Router = Router();

router.use(requireAuth);

router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const sites = await WordPressSiteManager.getSites(userId);
    res.json({ connected: sites.length > 0, sitesCount: sites.length });
  } catch (error) {
    handleError(res, error, 'Failed to get WordPress status');
  }
});

router.get('/sites', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const sites = await WordPressSiteManager.getSites(userId);
    res.json({ success: true, sites });
  } catch (error) {
    handleError(res, error, 'Failed to get sites');
  }
});

router.post(
  '/sites',
  validateBody(connectSiteBodySchema),
  async (req: TypedRequest<ConnectSiteBody>, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const { siteUrl, username, appPassword, label } = req.body;

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
        connectionTest = { success: false, error: testErr.message };
      }

      res.status(201).json({ success: true, site: savedSite, connectionTest });
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('already saved')) {
        res.status(409).json({ error: 'Site already exists', message: err.message });
        return;
      }
      handleError(res, error, 'Failed to connect site');
    }
  }
);

router.put(
  '/sites/:id',
  validateBody(updateSiteBodySchema),
  async (req: TypedRequest<UpdateSiteBody, { id: string }>, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const siteId = req.params.id;
      const { label, is_active, username, appPassword } = req.body;

      const updates: Record<string, unknown> = {};
      if (typeof label === 'string') updates.label = label.trim() || null;
      if (typeof is_active === 'boolean') updates.is_active = is_active;
      if (typeof username === 'string') updates.username = username;
      if (typeof appPassword === 'string') updates.app_password = appPassword;

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: 'No valid updates provided' });
        return;
      }

      const updatedSite = await WordPressSiteManager.updateSite(userId, siteId, updates);
      res.json({ success: true, site: updatedSite });
    } catch (error) {
      handleError(res, error, 'Failed to update site');
    }
  }
);

router.delete('/sites/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const result = await WordPressSiteManager.deleteSite(userId, req.params.id);
    res.json(result);
  } catch (error) {
    handleError(res, error, 'Failed to delete site');
  }
});

router.post(
  '/test-connection',
  validateBody(testConnectionBodySchema),
  async (req: TypedRequest<TestConnectionBody>, res: Response): Promise<void> => {
    try {
      getUserId(req);
      const { siteUrl, username, appPassword } = req.body;

      const client = await WordPressApiClient.create(siteUrl, username, appPassword);
      res.json(await client.testConnection());
    } catch (error) {
      handleError(res, error, 'Connection test failed');
    }
  }
);

router.post(
  '/publish',
  validateBody(publishBodySchema),
  async (req: TypedRequest<PublishBody>, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const { siteId, title, content, status, excerpt } = req.body;

      const client = await getClientForSite(userId, siteId);

      try {
        const result = await client.createPost(title, content, {
          status: status || 'draft',
          ...(excerpt != null && { excerpt }),
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
        await WordPressSiteManager.updateLastError(userId, siteId, (publishError as Error).message);
        throw publishError;
      }
    } catch (error) {
      handleError(res, error, 'Failed to publish post');
    }
  }
);

router.get(
  '/sites/:id/posts',
  async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const client = await getClientForSite(userId, req.params.id);

      const params: GetPostsParams = {
        per_page: req.query.per_page ? parseInt(req.query.per_page as string, 10) : 10,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      };
      if (req.query.status) params.status = req.query.status as string;
      if (req.query.search) params.search = req.query.search as string;

      res.json({ success: true, ...(await client.getPosts(params)) });
    } catch (error) {
      handleError(res, error, 'Failed to list posts');
    }
  }
);

router.get(
  '/sites/:id/posts/:postId',
  async (req: Request<{ id: string; postId: string }>, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const postId = parseInt(req.params.postId, 10);
      if (isNaN(postId)) {
        res.status(400).json({ error: 'Invalid post ID' });
        return;
      }

      const client = await getClientForSite(userId, req.params.id);
      res.json({ success: true, post: await client.getPost(postId) });
    } catch (error) {
      handleError(res, error, 'Failed to get post');
    }
  }
);

router.put(
  '/sites/:id/posts/:postId',
  validateBody(updatePostBodySchema),
  async (
    req: TypedRequest<UpdatePostBody, { id: string; postId: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const userId = getUserId(req);
      const siteId = req.params.id;
      const postId = parseInt(req.params.postId, 10);
      const { title, content, status, excerpt } = req.body;

      if (isNaN(postId)) {
        res.status(400).json({ error: 'Invalid post ID' });
        return;
      }

      const client = await getClientForSite(userId, siteId);
      const result = await client.updatePost(postId, title, content, {
        ...(status != null && { status }),
        ...(excerpt != null && { excerpt }),
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
      handleError(res, error, 'Failed to update post');
    }
  }
);

router.get(
  '/sites/:id/categories',
  async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const client = await getClientForSite(userId, req.params.id);
      res.json({ success: true, categories: await client.getCategories() });
    } catch (error) {
      handleError(res, error, 'Failed to get categories');
    }
  }
);

export default router;
