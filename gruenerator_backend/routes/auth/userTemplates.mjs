import express from 'express';
import { supabaseService } from '../../utils/supabaseClient.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { urlCrawlerService } from '../../services/urlCrawlerService.js';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

// Add debugging middleware to all user templates routes
router.use((req, res, next) => {
  console.log(`[User Templates] ${req.method} ${req.originalUrl} - User ID: ${req.user?.id}`);
  next();
});

// === HELPER FUNCTIONS ===

/**
 * Validates and extracts information from Canva URLs
 * @param {string} url - The Canva URL to process
 * @returns {Promise<{isValid: boolean, designId?: string, cleanUrl?: string, error?: string}>}
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
    
    // Extract design ID from various Canva URL patterns
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
    // Create a clean URL without tracking parameters
    const cleanUrl = `https://www.canva.com/design/${designId}/view`;
    
    return {
      isValid: true,
      designId,
      cleanUrl
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
    let previewImage = null;
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
        previewImage = extractedData.previewImage || null;
        dimensions = extractedData.dimensions || null;
        categories = extractedData.categories || [];
        
        console.log('[processCanvaUrl] Enhanced metadata extracted:', {
          hasPreviewImage: !!previewImage,
          hasDimensions: !!dimensions,
          categoriesCount: categories.length
        });
      }
      
      console.log('[processCanvaUrl] Successfully extracted data from Canva page:', { title, enhancedMetadata });
    } catch (error) {
      console.warn('[processCanvaUrl] Could not extract data from HTML, using fallback:', error.message);
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

    // Add enhanced metadata to template data if available
    if (enhancedMetadata) {
      if (previewImage) {
        templateData.preview_image_url = previewImage;
      }
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
    console.error('[processCanvaUrl] Error processing Canva URL:', error);
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
    
    // Fetch user's Canva templates from user_content table
    const { data: templates, error } = await supabaseService
      .from('user_content')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'template')
      .order('updated_at', { ascending: false });
      
    if (error) {
      console.error('[User Templates /user-templates GET] Supabase error:', error);
      throw new Error(error.message);
    }
    
    // Transform data to match frontend expectations
    const formattedTemplates = templates.map(template => ({
      id: template.id,
      title: template.title,
      description: template.description,
      type: template.type,
      template_type: template.metadata?.template_type || 'canva',
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
    console.error('[User Templates /user-templates GET] Error:', error);
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
      is_private = true
    } = req.body;
    
    // Validate required fields
    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Titel ist erforderlich.'
      });
    }
    
    // Prepare template data for user_content table
    const templateData = {
      user_id: userId,
      type: 'template',
      title: title.trim(),
      description: description?.trim() || null,
      content_data,
      thumbnail_url: preview_image_url || null,
      external_url: canva_url || null,
      metadata: {
        ...metadata,
        template_type
      },
      categories: Array.isArray(categories) ? categories : [],
      tags: Array.isArray(tags) ? tags : [],
      images: Array.isArray(images) ? images : [],
      is_private: is_private !== false, // Default to private
      status: 'published'
    };
    
    // Insert template with retry logic for status constraint issues
    let newTemplate;
    let error;
    const statusFallbacks = ['published', 'private', 'public', 'enabled', 'active'];
    
    for (const statusValue of statusFallbacks) {
      try {
        const templateDataWithStatus = { ...templateData, status: statusValue };
        const result = await supabaseService
          .from('user_content')
          .insert(templateDataWithStatus)
          .select()
          .single();
          
        if (result.error) {
          // If this is a status constraint error, try next status value
          if (result.error.code === '23514' && result.error.message.includes('status')) {
            console.log(`[User Templates] Status '${statusValue}' not allowed, trying next...`);
            continue;
          }
          // For other errors, throw immediately
          throw new Error(result.error.message);
        }
        
        // Success! Break out of the loop
        newTemplate = result.data;
        error = null;
        console.log(`[User Templates] Successfully created template with status: ${statusValue}`);
        break;
        
      } catch (insertError) {
        error = insertError;
        console.log(`[User Templates] Failed with status '${statusValue}':`, insertError.message);
      }
    }
    
    if (error) {
      console.error('[User Templates /user-templates POST] All status values failed:', error);
      throw new Error('Template konnte nicht erstellt werden. Datenbankkonflikt bei Status-Feld.');
    }
    
    // Format response
    const formattedTemplate = {
      id: newTemplate.id,
      title: newTemplate.title,
      description: newTemplate.description,
      type: newTemplate.type,
      template_type: newTemplate.metadata?.template_type || 'canva',
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
    console.error('[User Templates /user-templates POST] Error:', error);
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
    const { data: existingTemplate, error: checkError } = await supabaseService
      .from('user_content')
      .select('user_id, metadata')
      .eq('id', id)
      .eq('type', 'template')
      .single();
      
    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Vorlage nicht gefunden.'
        });
      }
      throw new Error(checkError.message);
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
    if (canva_url !== undefined) updateData.external_url = canva_url;
    if (preview_image_url !== undefined) updateData.thumbnail_url = preview_image_url;
    if (images !== undefined) updateData.images = Array.isArray(images) ? images : [];
    if (categories !== undefined) updateData.categories = Array.isArray(categories) ? categories : [];
    if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : [];
    if (content_data !== undefined) updateData.content_data = content_data;
    if (is_private !== undefined) updateData.is_private = is_private;
    
    // Update metadata
    if (metadata !== undefined || template_type !== undefined) {
      updateData.metadata = {
        ...(existingTemplate.metadata || {}),
        ...(metadata || {}),
        ...(template_type ? { template_type } : {})
      };
    }
    
    // Update template
    const { data: updatedTemplate, error } = await supabaseService
      .from('user_content')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
      
    if (error) {
      console.error('[User Templates /user-templates PUT] Supabase error:', error);
      throw new Error(error.message);
    }
    
    // Format response
    const formattedTemplate = {
      id: updatedTemplate.id,
      title: updatedTemplate.title,
      description: updatedTemplate.description,
      type: updatedTemplate.type,
      template_type: updatedTemplate.metadata?.template_type || 'canva',
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
    console.error('[User Templates /user-templates PUT] Error:', error);
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
    const { data: deletedTemplate, error } = await supabaseService
      .from('user_content')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .eq('type', 'template')
      .select()
      .single();
      
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Vorlage nicht gefunden oder keine Berechtigung zum Löschen.'
        });
      }
      throw new Error(error.message);
    }
    
    res.json({ 
      success: true, 
      message: 'Vorlage wurde erfolgreich gelöscht.'
    });
    
  } catch (error) {
    console.error('[User Templates /user-templates DELETE] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Löschen der Vorlage.'
    });
  }
});

// Create template from URL (specifically for Canva URLs)
router.post('/user-templates/from-url', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { url, enhancedMetadata = false } = req.body;
    
    // Validate required fields
    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'URL ist erforderlich.'
      });
    }
    
    console.log('[User Templates /user-templates/from-url POST] Processing URL with enhanced metadata:', enhancedMetadata);
    
    // Process the Canva URL with optional enhanced metadata
    const processResult = await processCanvaUrl(url.trim(), enhancedMetadata);
    if (!processResult.success) {
      return res.status(400).json({
        success: false,
        message: processResult.error
      });
    }
    
    const { templateData } = processResult;
    
    // Check if a template with this Canva URL already exists for this user
    const { data: existingTemplate } = await supabaseService
      .from('user_content')
      .select('id, title')
      .eq('user_id', userId)
      .eq('type', 'template')
      .eq('external_url', templateData.canva_url)
      .single();
      
    if (existingTemplate) {
      return res.status(409).json({
        success: false,
        message: `Eine Vorlage mit dieser URL existiert bereits: "${existingTemplate.title}"`
      });
    }
    
    // Prepare template data for user_content table
    const newTemplateData = {
      user_id: userId,
      type: 'template',
      title: templateData.title,
      description: templateData.description || null,
      content_data: {
        originalUrl: templateData.originalUrl,
        designId: templateData.designId,
        ...(templateData.dimensions && { dimensions: templateData.dimensions })
      },
      thumbnail_url: templateData.preview_image_url || null,
      external_url: templateData.canva_url,
      metadata: {
        template_type: templateData.template_type,
        source: 'url_import',
        designId: templateData.designId,
        ...(templateData.dimensions && { dimensions: templateData.dimensions }),
        enhanced_metadata: enhancedMetadata
      },
      categories: templateData.categories && templateData.categories.length > 0 
        ? [...new Set([...templateData.categories, 'canva'])] // Merge extracted categories with 'canva'
        : ['canva'], // Default category
      tags: templateData.categories && templateData.categories.length > 0
        ? [...new Set([...templateData.categories, 'imported'])] // Use categories as tags too
        : ['imported'], // Default tag
      images: [],
      is_private: true,      // Default to private
      status: 'published'
    };
    
    // Insert template with retry logic for status constraint issues
    let newTemplate;
    let error;
    const statusFallbacks = ['published', 'private', 'public', 'enabled', 'active'];
    
    for (const statusValue of statusFallbacks) {
      try {
        const templateDataWithStatus = { ...newTemplateData, status: statusValue };
        const result = await supabaseService
          .from('user_content')
          .insert(templateDataWithStatus)
          .select()
          .single();
          
        if (result.error) {
          // If this is a status constraint error, try next status value
          if (result.error.code === '23514' && result.error.message.includes('status')) {
            console.log(`[User Templates] Status '${statusValue}' not allowed, trying next...`);
            continue;
          }
          // For other errors, throw immediately
          throw new Error(result.error.message);
        }
        
        // Success! Break out of the loop
        newTemplate = result.data;
        error = null;
        console.log(`[User Templates] Successfully created template with status: ${statusValue}`);
        break;
        
      } catch (insertError) {
        error = insertError;
        console.log(`[User Templates] Failed with status '${statusValue}':`, insertError.message);
      }
    }
    
    if (error) {
      console.error('[User Templates /user-templates/from-url POST] All status values failed:', error);
      throw new Error('Template konnte nicht erstellt werden. Datenbankkonflikt bei Status-Feld.');
    }
    
    // Format response
    const formattedTemplate = {
      id: newTemplate.id,
      title: newTemplate.title,
      description: newTemplate.description,
      type: newTemplate.type,
      template_type: newTemplate.metadata?.template_type || 'canva',
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
    console.error('[User Templates /user-templates/from-url POST] Error:', error);
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
    const { data: existingTemplate, error: checkError } = await supabaseService
      .from('user_content')
      .select('user_id, metadata')
      .eq('id', id)
      .eq('type', 'template')
      .single();
      
    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Vorlage nicht gefunden.'
        });
      }
      throw new Error(checkError.message);
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
    
    // Update metadata if template_type is provided
    if (template_type !== undefined) {
      updateData.metadata = {
        ...(existingTemplate.metadata || {}),
        template_type
      };
    }
    
    // Update template
    const { data: updatedTemplate, error } = await supabaseService
      .from('user_content')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
      
    if (error) {
      console.error('[User Templates /user-templates/:id/metadata POST] Supabase error:', error);
      throw new Error(error.message);
    }
    
    res.json({ 
      success: true, 
      message: 'Vorlagen-Metadaten wurden erfolgreich aktualisiert.'
    });
    
  } catch (error) {
    console.error('[User Templates /user-templates/:id/metadata POST] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Aktualisieren der Vorlagen-Metadaten.'
    });
  }
});

export default router;