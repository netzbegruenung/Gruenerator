/**
 * User templates CRUD operations
 * Handles personal template management
 */

import express, { type Router, type Response, type NextFunction } from 'express';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import {
  urlCrawlerService,
  UrlValidator,
} from '../../../services/scrapers/implementations/UrlCrawler/index.js';
import { createLogger } from '../../../utils/logger.js';

import type { AuthRequest } from '../types.js';

const log = createLogger('userTemplates');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

function extractTagsFromDescription(description: string | undefined | null): string[] {
  if (!description || typeof description !== 'string') return [];
  const tagPattern = /#([\w-]+)/g;
  const tags: string[] = [];
  let match;
  while ((match = tagPattern.exec(description)) !== null) {
    const tag = match[1].toLowerCase();
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

const router: Router = express.Router();

// Add debugging middleware to all user templates routes
router.use((req: AuthRequest, _res: Response, next: NextFunction) => {
  log.info(`[User Templates] ${req.method} ${req.originalUrl} - User ID: ${req.user?.id}`);
  next();
});

// === URL PREVIEW / CRAWL ENDPOINT ===

router.post(
  '/user-templates/from-url',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { url, preview, title, description, metadata } = req.body;

      if (!url || typeof url !== 'string') {
        res.status(400).json({ success: false, message: 'URL ist erforderlich.' });
        return;
      }

      const validation = await UrlValidator.validateUrl(url);
      if (!validation.isValid) {
        res.status(400).json({ success: false, message: validation.error || 'Ungültige URL.' });
        return;
      }

      const crawlResult = await urlCrawlerService.crawlUrl(url, {
        enhancedMetadata: true,
        metadataOnly: true,
        timeout: 15000,
      });

      if (!crawlResult.success || !crawlResult.data) {
        res.status(400).json({
          success: false,
          message: crawlResult.error || 'Seite konnte nicht geladen werden.',
        });
        return;
      }

      const crawled = crawlResult.data;

      // Preview mode: return extracted metadata without saving
      if (preview) {
        res.json({
          success: true,
          preview: {
            title: crawled.title || null,
            description: crawled.description || null,
            thumbnail_url: crawled.previewImage || null,
            dimensions: crawled.dimensions || null,
            categories: crawled.categories || [],
            final_url: crawled.canonical || url,
          },
        });
        return;
      }

      // Save mode: create template from crawled data
      const userId = req.user!.id;
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const descriptionTags = extractTagsFromDescription(description);
      const mergedTags = [...new Set(descriptionTags)];

      const templateData = {
        user_id: userId,
        type: 'template',
        title: (title || crawled.title || 'Vorlage').trim(),
        description: (description || crawled.description || '').trim() || null,
        template_type: 'canva',
        external_url: crawled.canonical || url,
        thumbnail_url: crawled.previewImage || null,
        images: JSON.stringify(crawled.previewImage ? [{ url: crawled.previewImage }] : []),
        categories: JSON.stringify([]),
        tags: JSON.stringify(mergedTags),
        content_data: JSON.stringify({}),
        metadata: JSON.stringify({
          ...(metadata || {}),
          crawled_from: url,
          dimensions: crawled.dimensions || null,
        }),
        is_private: false,
        is_example: false,
        status: 'pending_review',
      };

      const newTemplate = await postgres.insert('user_templates', templateData);

      res.status(201).json({
        success: true,
        data: { id: newTemplate.id },
        message: 'Vorlage wurde eingereicht und wird geprüft.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Templates /from-url] Error:', err);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Verarbeiten der URL.',
      });
    }
  }
);

// === USER TEMPLATES MANAGEMENT ENDPOINTS ===

// Get user's templates
router.get(
  '/user-templates',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      // Fetch user's templates from user_templates table (excluding examples)
      const templates = await postgres.query(
        `SELECT * FROM user_templates
       WHERE user_id = $1 AND type = $2 AND is_example = $3
       ORDER BY updated_at DESC`,
        [userId, 'template', false],
        { table: 'user_templates' }
      );

      // Transform data to match frontend expectations
      const formattedTemplates = (templates || []).map((template: any) => ({
        id: template.id,
        title: template.title,
        description: template.description,
        type: template.type,
        template_type: template.template_type,
        external_url: template.external_url,
        preview_image_url: template.thumbnail_url,
        images: template.images || [],
        categories: template.categories || [],
        tags: template.tags || [],
        content_data: template.content_data,
        metadata: template.metadata,
        is_private: template.is_private,
        status: template.status,
        created_at: template.created_at,
        updated_at: template.updated_at,
      }));

      res.json({
        success: true,
        data: formattedTemplates,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Templates /user-templates GET] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden der Vorlagen.',
      });
    }
  }
);

// Create new template
router.post(
  '/user-templates',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const {
        title,
        description,
        template_type = 'template',
        external_url: externalUrl,
        preview_image_url,
        images = [],
        categories = [],
        tags = [],
        content_data = {},
        metadata = {},
        is_private = false,
      } = req.body;

      // Validate required fields
      if (!title) {
        res.status(400).json({
          success: false,
          message: 'Titel ist erforderlich.',
        });
        return;
      }

      // Extract tags from description and merge with provided tags (lowercase for case-insensitive search)
      const descriptionTags = extractTagsFromDescription(description).map((t) => t.toLowerCase());
      const providedTags = Array.isArray(tags) ? tags.map((t) => t.toLowerCase()) : [];
      const mergedTags = [...new Set([...descriptionTags, ...providedTags])];

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      // Prepare template data for user_templates table
      const templateData = {
        user_id: userId,
        type: 'template',
        title: title.trim(),
        description: description?.trim() || null,
        template_type,
        external_url: externalUrl || null,
        thumbnail_url: preview_image_url || null,
        images: JSON.stringify(Array.isArray(images) ? images : []),
        categories: JSON.stringify(Array.isArray(categories) ? categories : []),
        tags: JSON.stringify(mergedTags),
        content_data: JSON.stringify(content_data || {}),
        metadata: JSON.stringify(metadata || {}),
        is_private: is_private !== false,
        is_example: false,
        status: is_private !== false ? 'draft' : 'pending_review',
      };

      const newTemplate = await postgres.insert('user_templates', templateData);

      // Format response
      const formattedTemplate = {
        id: newTemplate.id,
        title: newTemplate.title,
        description: newTemplate.description,
        type: newTemplate.type,
        template_type: newTemplate.template_type,
        external_url: newTemplate.external_url,
        preview_image_url: newTemplate.thumbnail_url,
        images: newTemplate.images || [],
        categories: newTemplate.categories || [],
        tags: newTemplate.tags || [],
        content_data: newTemplate.content_data,
        metadata: newTemplate.metadata,
        is_private: newTemplate.is_private,
        status: newTemplate.status,
        created_at: newTemplate.created_at,
        updated_at: newTemplate.updated_at,
      };

      res.status(201).json({
        success: true,
        data: formattedTemplate,
        message: newTemplate.is_private
          ? 'Vorlage wurde erstellt.'
          : 'Vorlage wurde eingereicht und wird geprüft.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Templates /user-templates POST] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Erstellen der Vorlage.',
      });
    }
  }
);

// Update existing template
router.put(
  '/user-templates/:id',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const {
        title,
        description,
        template_type,
        external_url: externalUrlUpdate,
        preview_image_url,
        images,
        categories,
        tags,
        content_data,
        metadata,
        is_private,
      } = req.body;

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      // Verify ownership
      const existingTemplate = await postgres.queryOne(
        `SELECT user_id, metadata FROM user_templates
       WHERE id = $1 AND type = $2`,
        [id, 'template'],
        { table: 'user_templates' }
      );

      if (!existingTemplate) {
        res.status(404).json({
          success: false,
          message: 'Vorlage nicht gefunden.',
        });
        return;
      }

      if (existingTemplate.user_id !== userId) {
        res.status(403).json({
          success: false,
          message: 'Keine Berechtigung, diese Vorlage zu bearbeiten.',
        });
        return;
      }

      // Prepare update data
      const updateData: Record<string, any> = {};

      if (title !== undefined) updateData.title = title.trim();
      if (description !== undefined) updateData.description = description?.trim() || null;
      if (template_type !== undefined) updateData.template_type = template_type;
      if (externalUrlUpdate !== undefined) updateData.external_url = externalUrlUpdate;
      if (preview_image_url !== undefined) updateData.thumbnail_url = preview_image_url;
      if (images !== undefined) updateData.images = Array.isArray(images) ? images : [];
      if (categories !== undefined)
        updateData.categories = Array.isArray(categories) ? categories : [];
      if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : [];
      if (content_data !== undefined) updateData.content_data = content_data;
      if (is_private !== undefined) updateData.is_private = is_private;

      // Update metadata
      if (metadata !== undefined) {
        const existingMetadata = (existingTemplate.metadata || {}) as Record<string, unknown>;
        updateData.metadata = {
          ...existingMetadata,
          ...(metadata || {}),
        };
      }

      // Update template
      const result = await postgres.update('user_templates', updateData, { id, user_id: userId });

      if (result.changes === 0) {
        throw new Error('Template nicht gefunden oder nicht aktualisiert');
      }

      const updatedTemplate = result.data[0];

      // Format response
      const formattedTemplate = {
        id: updatedTemplate.id,
        title: updatedTemplate.title,
        description: updatedTemplate.description,
        type: updatedTemplate.type,
        template_type: updatedTemplate.template_type,
        external_url: updatedTemplate.external_url,
        preview_image_url: updatedTemplate.thumbnail_url,
        images: updatedTemplate.images || [],
        categories: updatedTemplate.categories || [],
        tags: updatedTemplate.tags || [],
        content_data: updatedTemplate.content_data,
        metadata: updatedTemplate.metadata,
        is_private: updatedTemplate.is_private,
        status: updatedTemplate.status,
        created_at: updatedTemplate.created_at,
        updated_at: updatedTemplate.updated_at,
      };

      res.json({
        success: true,
        data: formattedTemplate,
        message: 'Vorlage wurde erfolgreich aktualisiert.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Templates /user-templates PUT] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Aktualisieren der Vorlage.',
      });
    }
  }
);

// Delete template
router.delete(
  '/user-templates/:id',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      // Verify ownership and delete
      const result = await postgres.delete('user_templates', {
        id,
        user_id: userId,
        type: 'template',
      });

      if (result.changes === 0) {
        res.status(404).json({
          success: false,
          message: 'Vorlage nicht gefunden oder keine Berechtigung zum Löschen.',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Vorlage wurde erfolgreich gelöscht.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Templates /user-templates DELETE] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Löschen der Vorlage.',
      });
    }
  }
);

// Update template metadata only
router.post(
  '/user-templates/:id/metadata',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { title, description, template_type, is_private } = req.body;

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      // Verify ownership
      const existingTemplate = await postgres.queryOne(
        `SELECT user_id, metadata FROM user_templates
       WHERE id = $1 AND type = $2`,
        [id, 'template'],
        { table: 'user_templates' }
      );

      if (!existingTemplate) {
        res.status(404).json({
          success: false,
          message: 'Vorlage nicht gefunden.',
        });
        return;
      }

      if (existingTemplate.user_id !== userId) {
        res.status(403).json({
          success: false,
          message: 'Keine Berechtigung, diese Vorlage zu bearbeiten.',
        });
        return;
      }

      // Prepare update data
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (title !== undefined) updateData.title = title.trim();
      if (description !== undefined) updateData.description = description?.trim() || null;
      if (is_private !== undefined) updateData.is_private = is_private;

      // Update template_type if provided
      if (template_type !== undefined) {
        updateData.template_type = template_type;
      }

      // Update template
      const result = await postgres.update('user_templates', updateData, { id, user_id: userId });

      if (result.changes === 0) {
        throw new Error('Template nicht gefunden oder nicht aktualisiert');
      }

      res.json({
        success: true,
        message: 'Vorlagen-Metadaten wurden erfolgreich aktualisiert.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Templates /user-templates/:id/metadata POST] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Aktualisieren der Vorlagen-Metadaten.',
      });
    }
  }
);

// Bulk delete templates
router.delete(
  '/user-templates/bulk',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { ids } = req.body;

      // Validate input
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Array of template IDs is required',
        });
        return;
      }

      if (ids.length > 100) {
        res.status(400).json({
          success: false,
          message: 'Maximum 100 templates can be deleted at once',
        });
        return;
      }

      log.debug(
        `[User Templates /user-templates/bulk DELETE] Bulk delete request for ${ids.length} templates from user ${userId}`
      );

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      // First, verify all templates belong to the user
      const verifyTemplates = await postgres.query(
        `SELECT id FROM user_templates
       WHERE user_id = $1 AND type = $2 AND id = ANY($3)`,
        [userId, 'template', ids],
        { table: 'user_templates' }
      );

      const ownedIds = (verifyTemplates || []).map((template: any) => template.id);
      const unauthorizedIds = ids.filter((id: string) => !ownedIds.includes(id));

      if (unauthorizedIds.length > 0) {
        res.status(403).json({
          success: false,
          message: `Access denied for templates: ${unauthorizedIds.join(', ')}`,
          unauthorized_ids: unauthorizedIds,
        });
        return;
      }

      // Perform bulk delete
      const deletedData = await postgres.query(
        `DELETE FROM user_templates
       WHERE user_id = $1 AND type = $2 AND id = ANY($3)
       RETURNING id`,
        [userId, 'template', ids],
        { table: 'user_templates' }
      );

      const deletedIds = deletedData ? deletedData.map((template: any) => template.id) : [];
      const failedIds = ids.filter((id: string) => !deletedIds.includes(id));

      log.debug(
        `[User Templates /user-templates/bulk DELETE] Bulk delete completed: ${deletedIds.length} deleted, ${failedIds.length} failed`
      );

      res.json({
        success: true,
        message: `Bulk delete completed: ${deletedIds.length} of ${ids.length} templates deleted successfully`,
        deleted_count: deletedIds.length,
        failed_ids: failedIds,
        total_requested: ids.length,
        deleted_ids: deletedIds,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Templates /user-templates/bulk DELETE] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Failed to perform bulk delete of templates',
      });
    }
  }
);

export default router;
