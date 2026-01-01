import express from 'express';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { urlCrawlerService } from '../../services/scrapers/implementations/UrlCrawler/index.js';
import { createLogger } from '../../utils/logger.js';
const log = createLogger('userTemplates');


const { requireAuth: ensureAuthenticated } = authMiddlewareModule;
const postgres = getPostgresInstance();

const router = express.Router();

// Add debugging middleware to all user templates routes
router.use((req, res, next) => {
  log.info(`[User Templates] ${req.method} ${req.originalUrl} - User ID: ${req.user?.id}`);
  next();
});

// === HELPER FUNCTIONS ===

/**
 * Extracts tags from description using #hashtag syntax
 * @param {string} description - The description text
 * @returns {string[]} Array of extracted tags (lowercase, unique)
 */
function extractTagsFromDescription(description) {
  if (!description || typeof description !== 'string') return [];
  const tagPattern = /#([\w-]+)/g;
  const tags = [];
  let match;
  while ((match = tagPattern.exec(description)) !== null) {
    const tag = match[1].toLowerCase();
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

/**
 * Validates and extracts information from Canva URLs
 * @param {string} url - The Canva URL to process
 * @returns {Promise<{isValid: boolean, designId?: string, viewKey?: string, cleanUrl?: string, thumbnailUrl?: string, error?: string}>}
 */
async function validateCanvaUrl(url) {
  try {
    const urlObj = new URL(url);

    // Check if it's a Canva domain
    if (!urlObj.hostname.includes('canva.com')) {
      return {
        isValid: false,
        error: 'URL muss von canva.com stammen.'
      };
    }

    // Extract design ID and view key from various Canva URL patterns
    // Examples:
    // https://www.canva.com/design/DAGgS9o-sfY/F09k8mRenceUpp1Ve2XN8g/view?...
    // https://www.canva.com/design/DAGgS9o-sfY/view
    // https://www.canva.com/design/DAGgS9o-sfY/edit
    const designMatch = urlObj.pathname.match(/\/design\/([A-Za-z0-9_-]+)/);
    if (!designMatch) {
      return {
        isValid: false,
        error: 'Ungültige Canva URL. Bitte verwenden Sie eine gültige Design-URL.'
      };
    }

    const designId = designMatch[1];

    // Extract the view key (second path segment after design ID)
    // This is needed to construct the thumbnail URL
    // URL pattern: /design/{designId}/{viewKey}/view or /design/{designId}/{viewKey}/edit
    const fullPathMatch = urlObj.pathname.match(/\/design\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)(?:\/|$)/);
    const viewKey = fullPathMatch && fullPathMatch[2] && !['view', 'edit', 'watch'].includes(fullPathMatch[2])
      ? fullPathMatch[2]
      : null;

    // Create a clean URL without tracking parameters - preserve /view or keep original for embedding
    const cleanUrl = viewKey
      ? `https://www.canva.com/design/${designId}/${viewKey}/view`
      : `https://www.canva.com/design/${designId}/view`;

    // Construct thumbnail URL - Canva uses /screen endpoint for preview images
    const thumbnailUrl = viewKey
      ? `https://www.canva.com/design/${designId}/${viewKey}/screen`
      : null;

    return {
      isValid: true,
      designId,
      viewKey,
      cleanUrl,
      thumbnailUrl
    };
  } catch (error) {
    return {
      isValid: false,
      error: 'Ungültiges URL-Format.'
    };
  }
}

/**
 * Processes a Canva URL to extract metadata and create template data
 * @param {string} url - The Canva URL to process
 * @param {boolean} enhancedMetadata - Whether to extract enhanced metadata (images, dimensions, etc.)
 * @returns {Promise<{success: boolean, templateData?: Object, error?: string}>}
 */
async function processCanvaUrl(url, enhancedMetadata = false) {
  try {
    // Validate the Canva URL first
    const validation = await validateCanvaUrl(url);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error
      };
    }

    // Try to extract title and enhanced metadata from Canva page
    let title = `Canva Design ${validation.designId}`;
    let description = '';
    let previewImage = validation.thumbnailUrl || null; // Use constructed thumbnail URL
    let dimensions = null;
    let categories = [];

    try {
      // Use direct HTML fetching with optional enhanced metadata
      const { html } = await urlCrawlerService.fetchUrl(url);
      const extractedData = urlCrawlerService.extractContent(html, url, enhancedMetadata);

      if (extractedData && extractedData.title) {
        title = extractedData.title;
        description = extractedData.description || '';

        // Clean up Canva-specific title patterns
        title = title
          .replace(/\s*-\s*Canva$/, '') // Remove " - Canva" suffix
          .replace(/^Canva\s*-\s*/, '') // Remove "Canva - " prefix
          .trim();

        if (!title || title.length < 2) {
          title = `Canva Design ${validation.designId}`;
        }
      }

      // Extract enhanced metadata if requested
      if (enhancedMetadata && extractedData) {
        // Only override previewImage if extracted one exists
        if (extractedData.previewImage) {
          previewImage = extractedData.previewImage;
        }
        dimensions = extractedData.dimensions || null;
        categories = extractedData.categories || [];

        log.debug('[processCanvaUrl] Enhanced metadata extracted:', {
          hasPreviewImage: !!previewImage,
          hasDimensions: !!dimensions,
          categoriesCount: categories.length
        });
      }

      log.debug('[processCanvaUrl] Successfully extracted data from Canva page:', { title, enhancedMetadata });
    } catch (error) {
      log.warn('[processCanvaUrl] Could not extract data from HTML, using constructed thumbnail URL:', error.message);
      // Keep the constructed thumbnail URL from validation
      title = `Canva Design ${validation.designId}`;
    }

    const templateData = {
      title,
      description,
      template_type: 'canva',
      canva_url: validation.cleanUrl,
      designId: validation.designId,
      originalUrl: url
    };

    // Add preview image URL (either from extraction or constructed)
    if (previewImage) {
      templateData.preview_image_url = previewImage;
    }

    // Add other enhanced metadata if available
    if (enhancedMetadata) {
      if (dimensions) {
        templateData.dimensions = dimensions;
      }
      if (categories.length > 0) {
        templateData.categories = categories;
      }
    }

    return {
      success: true,
      templateData
    };
  } catch (error) {
    log.error('[processCanvaUrl] Error processing Canva URL:', error);
    return {
      success: false,
      error: 'Fehler beim Verarbeiten der Canva URL: ' + error.message
    };
  }
}

// === USER TEMPLATES MANAGEMENT ENDPOINTS ===

// Get user's templates
router.get('/user-templates', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Fetch user's Canva templates from user_templates table (excluding examples)
    const templates = await postgres.query(
      `SELECT * FROM user_templates 
       WHERE user_id = $1 AND type = $2 AND is_example = $3
       ORDER BY updated_at DESC`,
      [userId, 'template', false],
      { table: 'user_templates' }
    );
    
    // Transform data to match frontend expectations
    const formattedTemplates = templates.map(template => ({
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
    log.error('[User Templates /user-templates GET] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Laden der Vorlagen.'
    });
  }
});

// Create new template
router.post('/user-templates', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
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
      return res.status(400).json({
        success: false,
        message: 'Titel ist erforderlich.'
      });
    }
    
    // Extract tags from description and merge with provided tags
    const descriptionTags = extractTagsFromDescription(description);
    const providedTags = Array.isArray(tags) ? tags : [];
    const mergedTags = [...new Set([...descriptionTags, ...providedTags])];

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
    let newTemplate;
    let error;
    const statusFallbacks = ['published', 'private', 'public', 'enabled', 'active'];
    
    for (const statusValue of statusFallbacks) {
      try {
        const templateDataWithStatus = { ...templateData, status: statusValue };
        newTemplate = await postgres.insert('user_templates', templateDataWithStatus);
        
        // Success! Break out of the loop
        error = null;
        log.debug(`[User Templates] Successfully created template with status: ${statusValue}`);
        break;
        
      } catch (insertError) {
        error = insertError;
        log.debug(`[User Templates] Failed with status '${statusValue}':`, insertError.message);
        
        // If this is a status constraint error, try next status value
        if (insertError.message.includes('valid_template_status') || insertError.message.includes('status')) {
          log.debug(`[User Templates] Status '${statusValue}' not allowed, trying next...`);
          continue;
        }
        // For other errors, throw immediately
        throw insertError;
      }
    }
    
    if (error) {
      log.error('[User Templates /user-templates POST] All status values failed:', error);
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
    log.error('[User Templates /user-templates POST] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Erstellen der Vorlage.'
    });
  }
});

// Update existing template
router.put('/user-templates/:id', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
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
    
    // Verify ownership
    const existingTemplate = await postgres.queryOne(
      `SELECT user_id, metadata FROM user_templates 
       WHERE id = $1 AND type = $2`,
      [id, 'template'],
      { table: 'user_templates' }
    );
      
    if (!existingTemplate) {
      return res.status(404).json({
        success: false,
        message: 'Vorlage nicht gefunden.'
      });
    }
    
    if (existingTemplate.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung, diese Vorlage zu bearbeiten.'
      });
    }
    
    // Prepare update data (don't include updated_at - PostgresService handles it)
    const updateData = {};
    
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
      updateData.metadata = {
        ...(existingTemplate.metadata || {}),
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
    log.error('[User Templates /user-templates PUT] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Aktualisieren der Vorlage.'
    });
  }
});

// Delete template
router.delete('/user-templates/:id', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Verify ownership and delete
    const result = await postgres.delete('user_templates', { 
      id, 
      user_id: userId, 
      type: 'template' 
    });
      
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vorlage nicht gefunden oder keine Berechtigung zum Löschen.'
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Vorlage wurde erfolgreich gelöscht.'
    });
    
  } catch (error) {
    log.error('[User Templates /user-templates DELETE] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Löschen der Vorlage.'
    });
  }
});

// Create template from URL (specifically for Canva URLs)
// Supports preview mode: { preview: true } returns scraped data without creating template
router.post('/user-templates/from-url', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { url, enhancedMetadata = false, preview = false, title: customTitle, description: customDescription, metadata: inputMetadata = {} } = req.body;

    // Validate required fields
    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'URL ist erforderlich.'
      });
    }

    log.debug('[User Templates /user-templates/from-url POST] Processing URL with enhanced metadata:', enhancedMetadata, 'preview:', preview);

    // Process the Canva URL with optional enhanced metadata
    const processResult = await processCanvaUrl(url.trim(), true); // Always fetch enhanced metadata for preview
    if (!processResult.success) {
      return res.status(400).json({
        success: false,
        message: processResult.error
      });
    }

    const { templateData } = processResult;

    // If preview mode, return the scraped data without creating the template
    if (preview) {
      return res.json({
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
    }

    // Apply custom title/description if provided (user may have edited the preview)
    if (customTitle) {
      templateData.title = customTitle.trim();
    }
    if (customDescription !== undefined) {
      templateData.description = customDescription?.trim() || '';
    }
    
    // Check if a template with this Canva URL already exists for this user
    const existingTemplate = await postgres.queryOne(
      `SELECT id, title FROM user_templates
       WHERE user_id = $1 AND type = $2 AND external_url = $3`,
      [userId, 'template', templateData.canva_url],
      { table: 'user_templates' }
    );
      
    if (existingTemplate) {
      return res.status(409).json({
        success: false,
        message: `Eine Vorlage mit dieser URL existiert bereits: "${existingTemplate.title}"`
      });
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
    let newTemplate;
    let error;
    const statusFallbacks = ['published', 'private', 'public', 'enabled', 'active'];

    for (const statusValue of statusFallbacks) {
      try {
        const templateDataWithStatus = { ...newTemplateData, status: statusValue };
        newTemplate = await postgres.insert('user_templates', templateDataWithStatus);

        // Success! Break out of the loop
        error = null;
        log.debug(`[User Templates] Successfully created template with status: ${statusValue}`);
        break;

      } catch (insertError) {
        error = insertError;
        log.debug(`[User Templates] Failed with status '${statusValue}':`, insertError.message);

        // If this is a status constraint error, try next status value
        if (insertError.message.includes('valid_template_status') || insertError.message.includes('status')) {
          log.debug(`[User Templates] Status '${statusValue}' not allowed, trying next...`);
          continue;
        }
        // For other errors, throw immediately
        throw insertError;
      }
    }

    if (error) {
      log.error('[User Templates /user-templates/from-url POST] All status values failed:', error);
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
    log.error('[User Templates /user-templates/from-url POST] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Hinzufügen der Canva Vorlage.'
    });
  }
});

// Update template metadata only (for title updates, etc.)
router.post('/user-templates/:id/metadata', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { title, description, template_type, is_private } = req.body;
    
    // Verify ownership
    const existingTemplate = await postgres.queryOne(
      `SELECT user_id, metadata FROM user_templates 
       WHERE id = $1 AND type = $2`,
      [id, 'template'],
      { table: 'user_templates' }
    );
      
    if (!existingTemplate) {
      return res.status(404).json({
        success: false,
        message: 'Vorlage nicht gefunden.'
      });
    }
    
    if (existingTemplate.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung, diese Vorlage zu bearbeiten.'
      });
    }
    
    // Prepare update data
    const updateData = {
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
    log.error('[User Templates /user-templates/:id/metadata POST] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Aktualisieren der Vorlagen-Metadaten.'
    });
  }
});

// Bulk delete templates
router.delete('/user-templates/bulk', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { ids } = req.body;

    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array of template IDs is required'
      });
    }

    if (ids.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 100 templates can be deleted at once'
      });
    }

    log.debug(`[User Templates /user-templates/bulk DELETE] Bulk delete request for ${ids.length} templates from user ${userId}`);

    // First, verify all templates belong to the user
    const verifyTemplates = await postgres.query(
      `SELECT id FROM user_templates 
       WHERE user_id = $1 AND type = $2 AND id = ANY($3)`,
      [userId, 'template', ids],
      { table: 'user_templates' }
    );

    const ownedIds = verifyTemplates.map(template => template.id);
    const unauthorizedIds = ids.filter(id => !ownedIds.includes(id));

    if (unauthorizedIds.length > 0) {
      return res.status(403).json({
        success: false,
        message: `Access denied for templates: ${unauthorizedIds.join(', ')}`,
        unauthorized_ids: unauthorizedIds
      });
    }

    // Perform bulk delete
    const deletedData = await postgres.query(
      `DELETE FROM user_templates 
       WHERE user_id = $1 AND type = $2 AND id = ANY($3)
       RETURNING id`,
      [userId, 'template', ids],
      { table: 'user_templates' }
    );

    const deletedIds = deletedData ? deletedData.map(template => template.id) : [];
    const failedIds = ids.filter(id => !deletedIds.includes(id));

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
    log.error('[User Templates /user-templates/bulk DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to perform bulk delete of templates'
    });
  }
});

// Get examples (templates marked as examples)
router.get('/examples', ensureAuthenticated, async (req, res) => {
  try {
    const { type, limit = 20 } = req.query;
    
    // Build query for examples
    let sql = `SELECT id, title, description, content_data, metadata, categories, tags, thumbnail_url, external_url, type, created_at, updated_at
               FROM user_templates 
               WHERE is_example = $1 AND status = $2`;
    let params = [true, 'published'];
    
    // Filter by type if specified
    if (type) {
      sql += ` AND type = $3`;
      params.push(type);
    }
    
    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    
    const examples = await postgres.query(sql, params, { table: 'user_templates' });
    
    // Transform data to match frontend expectations
    const formattedExamples = examples.map(example => ({
      id: example.id,
      title: example.title,
      description: example.description,
      type: example.type || 'template',
      template_type: example.template_type || 'example',
      canva_url: example.external_url,
      preview_image_url: example.thumbnail_url,
      content_data: example.content_data,
      metadata: example.metadata,
      categories: example.categories || [],
      tags: example.tags || [],
      is_example: true,
      created_at: example.created_at,
      updated_at: example.updated_at
    }));
    
    res.json({ 
      success: true, 
      data: formattedExamples,
      count: formattedExamples.length
    });
    
  } catch (error) {
    log.error('[User Templates /examples GET] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Laden der Beispiele.'
    });
  }
});

// Find similar examples using vector search
router.post('/examples/similar', ensureAuthenticated, async (req, res) => {
  try {
    const { query, type, limit = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Suchanfrage ist erforderlich.'
      });
    }
    
    // Use vectorSearchService which uses dedicated RPCs (no execute_sql dependency)
    const { DocumentSearchService } = await import('../../services/DocumentSearchService.js');
    const documentSearchService = new DocumentSearchService();

    let vectorResults = [];
    try {
      const search = await documentSearchService.search({
        query: String(query).trim(),
        user_id: userId || 'system',
        limit: parseInt(limit),
        threshold: 0.25
      });
      if (search.success && Array.isArray(search.results)) {
        vectorResults = search.results;
      }
    } catch (vecErr) {
      log.warn('[User Templates /examples/similar POST] Vector examples search failed, falling back:', vecErr?.message);
    }

    if (!vectorResults || vectorResults.length === 0) {
      // Fallback to text search
      let fallbackSql = `SELECT id, title, description, content_data, metadata, categories, tags, thumbnail_url, external_url, type, created_at, updated_at
                         FROM user_templates
                         WHERE is_example = $1 AND status = $2 AND title ILIKE $3`;
      let fallbackParams = [true, 'published', `%${String(query).trim()}%`];

      if (type) {
        fallbackSql += ` AND type = $4`;
        fallbackParams.push(type);
      }

      fallbackSql += ` LIMIT $${fallbackParams.length + 1}`;
      fallbackParams.push(parseInt(limit));

      const fallbackResults = await postgres.query(fallbackSql, fallbackParams, { table: 'user_templates' });

      return res.json({
        success: true,
        data: fallbackResults || [],
        search_method: 'text_search',
        message: 'Verwendet Textsuche als Fallback'
      });
    }

    // Fetch full database rows to ensure consistent shape for frontend
    const ids = vectorResults.map(r => r.id).filter(Boolean);
    let fullRows = [];
    if (ids.length > 0) {
      const rows = await postgres.query(
        `SELECT id, title, description, content_data, metadata, categories, tags, thumbnail_url, external_url, type, created_at, updated_at
         FROM user_templates
         WHERE is_example = $1 AND status = $2 AND id = ANY($3)`,
        [true, 'published', ids],
        { table: 'user_templates' }
      );
      
      if (Array.isArray(rows)) {
        // Keep the vector order
        const rowMap = new Map(rows.map(r => [r.id, r]));
        fullRows = ids.map(id => rowMap.get(id)).filter(Boolean);
      }
    }

    const formattedResults = (fullRows.length > 0 ? fullRows : vectorResults).map(example => ({
      id: example.id,
      title: example.title,
      description: example.description,
      type: example.type,
      template_type: example.template_type || 'example',
      canva_url: example.external_url,
      preview_image_url: example.thumbnail_url,
      content_data: example.content_data,
      metadata: example.metadata,
      categories: example.categories || [],
      tags: example.tags || [],
      similarity: example.similarity || example.similarity_score || null,
      is_example: true,
      created_at: example.created_at,
      updated_at: example.updated_at
    }));

    res.json({
      success: true,
      data: formattedResults,
      query: String(query).trim(),
      search_method: 'vector_search',
      count: formattedResults.length
    });

  } catch (error) {
    log.error('[User Templates /examples/similar POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler bei der Ähnlichkeitssuche.'
    });
  }
});

// === VORLAGEN-DATENBANK GALLERY ENDPOINTS ===

// Get dynamic template type categories for Vorlagen gallery
router.get('/vorlagen-categories', ensureAuthenticated, async (req, res) => {
  try {
    const data = await postgres.query(
      `SELECT DISTINCT template_type
       FROM user_templates
       WHERE is_private = $1 AND status = $2 AND template_type IS NOT NULL
       ORDER BY template_type ASC`,
      [false, 'published'],
      { table: 'user_templates' }
    );

    const categories = (data || [])
      .map(row => row.template_type)
      .filter(Boolean)
      .map(type => ({
        id: type,
        label: type.charAt(0).toUpperCase() + type.slice(1)
      }));

    res.json({ success: true, categories });
  } catch (err) {
    log.error('[Vorlagen Gallery] /vorlagen-categories error:', err);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden der Kategorien',
      categories: []
    });
  }
});

// List all published templates for Vorlagen gallery
router.get('/vorlagen', ensureAuthenticated, async (req, res) => {
  console.log('>>> /vorlagen endpoint HIT <<<');
  try {
    const { searchTerm = '', searchMode = 'title', templateType, tags } = req.query;

    const conditions = ['is_private = $1', 'status = $2'];
    const params = [false, 'published'];
    let paramIndex = 3;

    if (templateType && templateType !== 'all') {
      conditions.push(`template_type = $${paramIndex++}`);
      params.push(templateType);
    }

    // Filter by tags using JSONB containment
    if (tags) {
      try {
        const tagsArray = JSON.parse(tags);
        if (Array.isArray(tagsArray) && tagsArray.length > 0) {
          conditions.push(`tags @> $${paramIndex++}::jsonb`);
          params.push(JSON.stringify(tagsArray));
        }
      } catch (e) {
        log.warn('[Vorlagen Gallery] Invalid tags JSON:', tags);
      }
    }

    if (searchTerm && String(searchTerm).trim().length > 0) {
      const term = `%${searchTerm.trim()}%`;
      if (searchMode === 'fulltext') {
        conditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
        params.push(term);
      } else {
        conditions.push(`title ILIKE $${paramIndex}`);
        params.push(term);
      }
    }

    const query = `
      SELECT id, title, description, template_type, thumbnail_url, external_url,
             images, categories, tags, content_data, metadata, created_at, updated_at
      FROM user_templates
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const data = await postgres.query(query, params, { table: 'user_templates' });

    const vorlagen = (data || []).map(item => {
      log.info(`[Vorlagen DEBUG] Item: id=${item.id}, title=${item.title}, external_url=${item.external_url}, content_data=${JSON.stringify(item.content_data)}, originalUrl=${item.content_data?.originalUrl}`);
      return {
        id: item.id,
        title: item.title,
        description: item.description,
        template_type: item.template_type,
        thumbnail_url: item.thumbnail_url,
        external_url: item.external_url,
        images: item.images || [],
        categories: item.categories || [],
        tags: item.tags || [],
        content_data: item.content_data || {},
        metadata: item.metadata || {},
        created_at: item.created_at,
        updated_at: item.updated_at
      };
    });

    res.json({ success: true, vorlagen });
  } catch (err) {
    log.error('[Vorlagen Gallery] /vorlagen GET error:', err);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden der Vorlagen',
      vorlagen: []
    });
  }
});

export default router;