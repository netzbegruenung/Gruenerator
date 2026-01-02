/**
 * User templates CRUD operations
 * Handles personal template management including Canva URL imports
 */

import express, { Router, Response, NextFunction } from 'express';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import { createLogger } from '../../../utils/logger.js';
import type { AuthRequest } from '../types.js';
import { extractTagsFromDescription, processCanvaUrl } from '../../../utils/canvaUtils.js';

// Re-export for backwards compatibility
export { extractTagsFromDescription, processCanvaUrl, validateCanvaUrl } from '../../../utils/canvaUtils.js';

const log = createLogger('userTemplates');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

// Add debugging middleware to all user templates routes
router.use((req: AuthRequest, _res: Response, next: NextFunction) => {
  log.info(`[User Templates] ${req.method} ${req.originalUrl} - User ID: ${req.user?.id}`);
  next();
});

// === USER TEMPLATES MANAGEMENT ENDPOINTS ===

// Get user's templates
router.get('/user-templates', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    // Fetch user's Canva templates from user_templates table (excluding examples)
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
      canva_url: template.external_url,
      preview_image_url: template.thumbnail_url,
      images: template.images || [],
      categories: template.categories || [],
      tags: template.tags || [],
      content_data: template.content_data,
      metadata: template.metadata,
      is_private: template.is_private,
      status: template.status,
      created_at: template.created_at,
      updated_at: template.updated_at
    }));

    res.json({
      success: true,
      data: formattedTemplates
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Templates /user-templates GET] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Laden der Vorlagen.'
    });
  }
});

// Create new template
router.post('/user-templates', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const {
      title,
      description,
      template_type = 'canva',
      canva_url,
      preview_image_url,
      images = [],
      categories = [],
      tags = [],
      content_data = {},
      metadata = {},
      is_private = false
    } = req.body;

    // Validate required fields
    if (!title) {
      res.status(400).json({
        success: false,
        message: 'Titel ist erforderlich.'
      });
      return;
    }

    // Extract tags from description and merge with provided tags
    const descriptionTags = extractTagsFromDescription(description);
    const providedTags = Array.isArray(tags) ? tags : [];
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
      external_url: canva_url || null,
      thumbnail_url: preview_image_url || null,
      images: JSON.stringify(Array.isArray(images) ? images : []),
      categories: JSON.stringify(Array.isArray(categories) ? categories : []),
      tags: JSON.stringify(mergedTags),
      content_data: JSON.stringify(content_data || {}),
      metadata: JSON.stringify(metadata || {}),
      is_private: is_private !== false,
      is_example: false,
      status: 'published'
    };

    // Insert template with retry logic for status constraint issues
    let newTemplate: any;
    let insertError: Error | null = null;
    const statusFallbacks = ['published', 'private', 'public', 'enabled', 'active'];

    for (const statusValue of statusFallbacks) {
      try {
        const templateDataWithStatus = { ...templateData, status: statusValue };
        newTemplate = await postgres.insert('user_templates', templateDataWithStatus);

        insertError = null;
        log.debug(`[User Templates] Successfully created template with status: ${statusValue}`);
        break;

      } catch (error) {
        insertError = error as Error;
        log.debug(`[User Templates] Failed with status '${statusValue}':`, insertError.message);

        if (insertError.message.includes('valid_template_status') || insertError.message.includes('status')) {
          log.debug(`[User Templates] Status '${statusValue}' not allowed, trying next...`);
          continue;
        }
        throw insertError;
      }
    }

    if (insertError) {
      log.error('[User Templates /user-templates POST] All status values failed:', insertError);
      throw new Error('Template konnte nicht erstellt werden. Datenbankkonflikt bei Status-Feld.');
    }

    // Format response
    const formattedTemplate = {
      id: newTemplate.id,
      title: newTemplate.title,
      description: newTemplate.description,
      type: newTemplate.type,
      template_type: newTemplate.template_type,
      canva_url: newTemplate.external_url,
      preview_image_url: newTemplate.thumbnail_url,
      images: newTemplate.images || [],
      categories: newTemplate.categories || [],
      tags: newTemplate.tags || [],
      content_data: newTemplate.content_data,
      metadata: newTemplate.metadata,
      is_private: newTemplate.is_private,
      status: newTemplate.status,
      created_at: newTemplate.created_at,
      updated_at: newTemplate.updated_at
    };

    res.status(201).json({
      success: true,
      data: formattedTemplate,
      message: 'Vorlage wurde erfolgreich erstellt.'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Templates /user-templates POST] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Erstellen der Vorlage.'
    });
  }
});

// Update existing template
router.put('/user-templates/:id', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const {
      title,
      description,
      template_type,
      canva_url,
      preview_image_url,
      images,
      categories,
      tags,
      content_data,
      metadata,
      is_private
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
        message: 'Vorlage nicht gefunden.'
      });
      return;
    }

    if (existingTemplate.user_id !== userId) {
      res.status(403).json({
        success: false,
        message: 'Keine Berechtigung, diese Vorlage zu bearbeiten.'
      });
      return;
    }

    // Prepare update data
    const updateData: Record<string, any> = {};

    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (template_type !== undefined) updateData.template_type = template_type;
    if (canva_url !== undefined) updateData.external_url = canva_url;
    if (preview_image_url !== undefined) updateData.thumbnail_url = preview_image_url;
    if (images !== undefined) updateData.images = Array.isArray(images) ? images : [];
    if (categories !== undefined) updateData.categories = Array.isArray(categories) ? categories : [];
    if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : [];
    if (content_data !== undefined) updateData.content_data = content_data;
    if (is_private !== undefined) updateData.is_private = is_private;

    // Update metadata
    if (metadata !== undefined) {
      const existingMetadata = (existingTemplate.metadata || {}) as Record<string, unknown>;
      updateData.metadata = {
        ...existingMetadata,
        ...(metadata || {})
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
      canva_url: updatedTemplate.external_url,
      preview_image_url: updatedTemplate.thumbnail_url,
      images: updatedTemplate.images || [],
      categories: updatedTemplate.categories || [],
      tags: updatedTemplate.tags || [],
      content_data: updatedTemplate.content_data,
      metadata: updatedTemplate.metadata,
      is_private: updatedTemplate.is_private,
      status: updatedTemplate.status,
      created_at: updatedTemplate.created_at,
      updated_at: updatedTemplate.updated_at
    };

    res.json({
      success: true,
      data: formattedTemplate,
      message: 'Vorlage wurde erfolgreich aktualisiert.'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Templates /user-templates PUT] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Aktualisieren der Vorlage.'
    });
  }
});

// Delete template
router.delete('/user-templates/:id', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    // Verify ownership and delete
    const result = await postgres.delete('user_templates', {
      id,
      user_id: userId,
      type: 'template'
    });

    if (result.changes === 0) {
      res.status(404).json({
        success: false,
        message: 'Vorlage nicht gefunden oder keine Berechtigung zum Löschen.'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Vorlage wurde erfolgreich gelöscht.'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Templates /user-templates DELETE] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Löschen der Vorlage.'
    });
  }
});

// Create template from URL (specifically for Canva URLs)
router.post('/user-templates/from-url', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const {
      url,
      enhancedMetadata = false,
      preview = false,
      title: customTitle,
      description: customDescription,
      metadata: inputMetadata = {}
    } = req.body;

    // Validate required fields
    if (!url) {
      res.status(400).json({
        success: false,
        message: 'URL ist erforderlich.'
      });
      return;
    }

    log.debug('[User Templates /user-templates/from-url POST] Processing URL with enhanced metadata:', enhancedMetadata, 'preview:', preview);

    // Process the Canva URL with optional enhanced metadata
    const processResult = await processCanvaUrl(url.trim(), true);
    if (!processResult.success || !processResult.templateData) {
      res.status(400).json({
        success: false,
        message: processResult.error
      });
      return;
    }

    const { templateData } = processResult;

    // If preview mode, return the scraped data without creating the template
    if (preview) {
      res.json({
        success: true,
        preview: {
          title: templateData.title,
          description: templateData.description || '',
          thumbnail_url: templateData.preview_image_url || null,
          external_url: templateData.canva_url,
          template_type: templateData.template_type,
          designId: templateData.designId,
          dimensions: templateData.dimensions || null
        }
      });
      return;
    }

    // Apply custom title/description if provided
    if (customTitle) {
      templateData.title = customTitle.trim();
    }
    if (customDescription !== undefined) {
      templateData.description = customDescription?.trim() || '';
    }

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    // Check if a template with this Canva URL already exists for this user
    const existingTemplate = await postgres.queryOne(
      `SELECT id, title FROM user_templates
       WHERE user_id = $1 AND type = $2 AND external_url = $3`,
      [userId, 'template', templateData.canva_url],
      { table: 'user_templates' }
    );

    if (existingTemplate) {
      res.status(409).json({
        success: false,
        message: `Eine Vorlage mit dieser URL existiert bereits: "${existingTemplate.title}"`
      });
      return;
    }

    // Extract tags from description
    const descriptionTags = extractTagsFromDescription(templateData.description);

    // Prepare template data for user_templates table
    const categoriesArray = templateData.categories && templateData.categories.length > 0
      ? [...new Set([...templateData.categories, 'canva'])]
      : ['canva'];
    const tagsArray = [...new Set([
      ...descriptionTags,
      ...(templateData.categories || []),
      'imported'
    ])];
    const contentDataObj = {
      originalUrl: templateData.originalUrl,
      designId: templateData.designId,
      ...(templateData.dimensions && { dimensions: templateData.dimensions })
    };
    const metadataObj = {
      source: 'url_import',
      designId: templateData.designId,
      ...(templateData.dimensions && { dimensions: templateData.dimensions }),
      enhanced_metadata: true,
      ...(inputMetadata?.author_name && { author_name: inputMetadata.author_name }),
      ...(inputMetadata?.contact_email && { contact_email: inputMetadata.contact_email })
    };

    const newTemplateData = {
      user_id: userId,
      type: 'template',
      title: templateData.title,
      description: templateData.description || null,
      template_type: templateData.template_type,
      external_url: templateData.canva_url,
      thumbnail_url: templateData.preview_image_url || null,
      images: JSON.stringify([]),
      categories: JSON.stringify(categoriesArray),
      tags: JSON.stringify(tagsArray),
      content_data: JSON.stringify(contentDataObj),
      metadata: JSON.stringify(metadataObj),
      is_private: false,
      is_example: false,
      status: 'published'
    };

    // Insert template with retry logic for status constraint issues
    let newTemplate: any;
    let insertError: Error | null = null;
    const statusFallbacks = ['published', 'private', 'public', 'enabled', 'active'];

    for (const statusValue of statusFallbacks) {
      try {
        const templateDataWithStatus = { ...newTemplateData, status: statusValue };
        newTemplate = await postgres.insert('user_templates', templateDataWithStatus);

        insertError = null;
        log.debug(`[User Templates] Successfully created template with status: ${statusValue}`);
        break;

      } catch (error) {
        insertError = error as Error;
        log.debug(`[User Templates] Failed with status '${statusValue}':`, insertError.message);

        if (insertError.message.includes('valid_template_status') || insertError.message.includes('status')) {
          log.debug(`[User Templates] Status '${statusValue}' not allowed, trying next...`);
          continue;
        }
        throw insertError;
      }
    }

    if (insertError) {
      log.error('[User Templates /user-templates/from-url POST] All status values failed:', insertError);
      throw new Error('Template konnte nicht erstellt werden. Datenbankkonflikt bei Status-Feld.');
    }

    // Format response
    const formattedTemplate = {
      id: newTemplate.id,
      title: newTemplate.title,
      description: newTemplate.description,
      type: newTemplate.type,
      template_type: newTemplate.template_type,
      canva_url: newTemplate.external_url,
      preview_image_url: newTemplate.thumbnail_url,
      images: newTemplate.images || [],
      categories: newTemplate.categories || [],
      tags: newTemplate.tags || [],
      content_data: newTemplate.content_data,
      metadata: newTemplate.metadata,
      is_private: newTemplate.is_private,
      status: newTemplate.status,
      created_at: newTemplate.created_at,
      updated_at: newTemplate.updated_at
    };

    res.status(201).json({
      success: true,
      data: formattedTemplate,
      message: 'Canva Vorlage wurde erfolgreich hinzugefügt.'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Templates /user-templates/from-url POST] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Hinzufügen der Canva Vorlage.'
    });
  }
});

// Update template metadata only
router.post('/user-templates/:id/metadata', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
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
        message: 'Vorlage nicht gefunden.'
      });
      return;
    }

    if (existingTemplate.user_id !== userId) {
      res.status(403).json({
        success: false,
        message: 'Keine Berechtigung, diese Vorlage zu bearbeiten.'
      });
      return;
    }

    // Prepare update data
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
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
      message: 'Vorlagen-Metadaten wurden erfolgreich aktualisiert.'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Templates /user-templates/:id/metadata POST] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Aktualisieren der Vorlagen-Metadaten.'
    });
  }
});

// Bulk delete templates
router.delete('/user-templates/bulk', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { ids } = req.body;

    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Array of template IDs is required'
      });
      return;
    }

    if (ids.length > 100) {
      res.status(400).json({
        success: false,
        message: 'Maximum 100 templates can be deleted at once'
      });
      return;
    }

    log.debug(`[User Templates /user-templates/bulk DELETE] Bulk delete request for ${ids.length} templates from user ${userId}`);

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
        unauthorized_ids: unauthorizedIds
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

    log.debug(`[User Templates /user-templates/bulk DELETE] Bulk delete completed: ${deletedIds.length} deleted, ${failedIds.length} failed`);

    res.json({
      success: true,
      message: `Bulk delete completed: ${deletedIds.length} of ${ids.length} templates deleted successfully`,
      deleted_count: deletedIds.length,
      failed_ids: failedIds,
      total_requested: ids.length,
      deleted_ids: deletedIds
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Templates /user-templates/bulk DELETE] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to perform bulk delete of templates'
    });
  }
});

export default router;
