import express from 'express';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const AbyssaleApiClient = require('../services/abyssaleApiClient.js');
const { requireAuth } = require('../middleware/authMiddleware.js');
const glob = require('glob');

const router = express.Router();

/**
 * Abyssale API Routes
 * 
 * Provides REST endpoints for interacting with Abyssale's image generation API.
 * All routes are protected by authentication middleware to ensure user access control.
 */

// Initialize Abyssale client
const abyssaleClient = new AbyssaleApiClient();

/**
 * Middleware to check Abyssale API configuration
 */
const checkAbyssaleConfig = (req, res, next) => {
  if (!abyssaleClient.isApiConfigured()) {
    return res.status(503).json({
      error: 'Abyssale service is not configured',
      message: 'ABYSSALE_API_KEY environment variable is required'
    });
  }
  next();
};

/**
 * Test Abyssale API connection
 * GET /api/abyssale/test
 */
router.get('/test', checkAbyssaleConfig, async (req, res) => {
  try {
    console.log('[AbyssaleAPI] Testing connection...');
    const isConnected = await abyssaleClient.testConnection();
    
    if (isConnected) {
      res.json({
        status: 'success',
        message: 'Abyssale API connection successful',
        configured: true
      });
    } else {
      res.status(503).json({
        status: 'error',
        message: 'Abyssale API connection failed',
        configured: false
      });
    }
  } catch (error) {
    console.error('[AbyssaleAPI] Connection test error:', error);
    res.status(500).json({
      error: 'Connection test failed',
      message: error.message
    });
  }
});

/**
 * Get all available designs/templates
 * GET /api/abyssale/designs
 */
router.get('/designs', requireAuth, checkAbyssaleConfig, async (req, res) => {
  try {
    const { category_id, type } = req.query;
    
    console.log(`[AbyssaleAPI] User ${req.user?.id} fetching designs`);
    
    const options = {};
    if (category_id) options.category_id = category_id;
    if (type) options.type = type;
    
    const designs = await abyssaleClient.getDesigns(options);
    
    res.json({
      success: true,
      data: designs,
      count: designs.length
    });
  } catch (error) {
    console.error('[AbyssaleAPI] Error fetching designs:', error);
    res.status(500).json({
      error: 'Failed to fetch designs',
      message: error.message
    });
  }
});

/**
 * Get design details by ID
 * GET /api/abyssale/designs/:designId
 */
router.get('/designs/:designId', requireAuth, checkAbyssaleConfig, async (req, res) => {
  try {
    const { designId } = req.params;
    
    if (!designId) {
      return res.status(400).json({
        error: 'Design ID is required'
      });
    }
    
    console.log(`[AbyssaleAPI] User ${req.user?.id} fetching design details: ${designId}`);
    
    const designDetails = await abyssaleClient.getDesignDetails(designId);
    
    res.json({
      success: true,
      data: designDetails
    });
  } catch (error) {
    console.error('[AbyssaleAPI] Error fetching design details:', error);
    res.status(500).json({
      error: 'Failed to fetch design details',
      message: error.message
    });
  }
});

/**
 * Generate a single image from a design
 * POST /api/abyssale/generate
 */
router.post('/generate', checkAbyssaleConfig, async (req, res) => {
  try {
    const { designId, elements, template_format_name, file_compression_level } = req.body;
    
    if (!designId) {
      return res.status(400).json({
        error: 'Design ID is required'
      });
    }
    
    if (!elements || typeof elements !== 'object') {
      return res.status(400).json({
        error: 'Elements object is required'
      });
    }
    
    console.log(`[AbyssaleAPI] User ${req.user?.id} generating image for design: ${designId}`);
    
    const generateData = {
      elements,
      ...(template_format_name && { template_format_name }),
      ...(file_compression_level && { file_compression_level })
    };
    
    // Generate image and automatically download it locally
    const result = await abyssaleClient.generateImageWithDownload(designId, generateData);
    
    res.json({
      success: true,
      data: result,
      message: 'Image generated and saved successfully'
    });
  } catch (error) {
    console.error('[AbyssaleAPI] Error generating image:', error);
    res.status(500).json({
      error: 'Failed to generate image',
      message: error.message
    });
  }
});

/**
 * Generate multiple format images asynchronously
 * POST /api/abyssale/generate-batch
 */
router.post('/generate-batch', checkAbyssaleConfig, async (req, res) => {
  try {
    const { designId, elements, template_format_names, callback_url } = req.body;
    
    if (!designId) {
      return res.status(400).json({
        error: 'Design ID is required'
      });
    }
    
    if (!elements || typeof elements !== 'object') {
      return res.status(400).json({
        error: 'Elements object is required'
      });
    }
    
    console.log(`[AbyssaleAPI] User ${req.user?.id} generating batch images for design: ${designId}`);
    
    const generateData = {
      elements,
      ...(template_format_names && { template_format_names }),
      ...(callback_url && { callback_url })
    };
    
    const result = await abyssaleClient.generateMultiFormatImages(designId, generateData);
    
    res.json({
      success: true,
      data: result,
      message: 'Batch generation initiated successfully'
    });
  } catch (error) {
    console.error('[AbyssaleAPI] Error generating batch images:', error);
    res.status(500).json({
      error: 'Failed to generate batch images',
      message: error.message
    });
  }
});

/**
 * Generate multi-page PDF
 * POST /api/abyssale/generate-pdf
 */
router.post('/generate-pdf', checkAbyssaleConfig, async (req, res) => {
  try {
    const { designId, pages, callback_url } = req.body;
    
    if (!designId) {
      return res.status(400).json({
        error: 'Design ID is required'
      });
    }
    
    if (!pages || typeof pages !== 'object') {
      return res.status(400).json({
        error: 'Pages object is required'
      });
    }
    
    console.log(`[AbyssaleAPI] User ${req.user?.id} generating PDF for design: ${designId}`);
    
    const generateData = {
      pages,
      ...(callback_url && { callback_url })
    };
    
    const result = await abyssaleClient.generateMultiPagePdf(designId, generateData);
    
    res.json({
      success: true,
      data: result,
      message: 'PDF generation initiated successfully'
    });
  } catch (error) {
    console.error('[AbyssaleAPI] Error generating PDF:', error);
    res.status(500).json({
      error: 'Failed to generate PDF',
      message: error.message
    });
  }
});

/**
 * Get file information by banner ID
 * GET /api/abyssale/files/:bannerId
 */
router.get('/files/:bannerId', checkAbyssaleConfig, async (req, res) => {
  try {
    const { bannerId } = req.params;
    
    if (!bannerId) {
      return res.status(400).json({
        error: 'Banner ID is required'
      });
    }
    
    console.log(`[AbyssaleAPI] User ${req.user?.id} fetching file: ${bannerId}`);
    
    const fileData = await abyssaleClient.getFile(bannerId);
    
    res.json({
      success: true,
      data: fileData
    });
  } catch (error) {
    console.error('[AbyssaleAPI] Error fetching file:', error);
    res.status(500).json({
      error: 'Failed to fetch file',
      message: error.message
    });
  }
});

/**
 * Get available fonts
 * GET /api/abyssale/fonts
 */
router.get('/fonts', requireAuth, checkAbyssaleConfig, async (req, res) => {
  try {
    console.log(`[AbyssaleAPI] User ${req.user?.id} fetching fonts`);
    
    const fonts = await abyssaleClient.getFonts();
    
    res.json({
      success: true,
      data: fonts,
      count: fonts.length
    });
  } catch (error) {
    console.error('[AbyssaleAPI] Error fetching fonts:', error);
    res.status(500).json({
      error: 'Failed to fetch fonts',
      message: error.message
    });
  }
});

/**
 * Create banner export (ZIP)
 * POST /api/abyssale/export
 */
router.post('/export', requireAuth, checkAbyssaleConfig, async (req, res) => {
  try {
    const { ids, callback_url } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: 'At least one banner ID is required'
      });
    }
    
    console.log(`[AbyssaleAPI] User ${req.user?.id} creating export for ${ids.length} banners`);
    
    const exportData = {
      ids,
      ...(callback_url && { callback_url })
    };
    
    const result = await abyssaleClient.createBannerExport(exportData);
    
    res.json({
      success: true,
      data: result,
      message: 'Export initiated successfully'
    });
  } catch (error) {
    console.error('[AbyssaleAPI] Error creating export:', error);
    res.status(500).json({
      error: 'Failed to create export',
      message: error.message
    });
  }
});

/**
 * Get all projects
 * GET /api/abyssale/projects
 */
router.get('/projects', requireAuth, checkAbyssaleConfig, async (req, res) => {
  try {
    console.log(`[AbyssaleAPI] User ${req.user?.id} fetching projects`);
    
    const projects = await abyssaleClient.getProjects();
    
    res.json({
      success: true,
      data: projects,
      count: projects.length
    });
  } catch (error) {
    console.error('[AbyssaleAPI] Error fetching projects:', error);
    res.status(500).json({
      error: 'Failed to fetch projects',
      message: error.message
    });
  }
});

/**
 * Create a new project
 * POST /api/abyssale/projects
 */
router.post('/projects', requireAuth, checkAbyssaleConfig, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || typeof name !== 'string' || name.length < 2 || name.length > 100) {
      return res.status(400).json({
        error: 'Project name must be between 2 and 100 characters'
      });
    }
    
    console.log(`[AbyssaleAPI] User ${req.user?.id} creating project: "${name}"`);
    
    const projectData = { name };
    const result = await abyssaleClient.createProject(projectData);
    
    res.json({
      success: true,
      data: result,
      message: 'Project created successfully'
    });
  } catch (error) {
    console.error('[AbyssaleAPI] Error creating project:', error);
    res.status(500).json({
      error: 'Failed to create project',
      message: error.message
    });
  }
});

/**
 * Duplicate workspace template
 * POST /api/abyssale/workspace-templates/:templateId/duplicate
 */
router.post('/workspace-templates/:templateId/duplicate', requireAuth, checkAbyssaleConfig, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { project_id, name } = req.body;
    
    if (!templateId) {
      return res.status(400).json({
        error: 'Template ID is required'
      });
    }
    
    if (!project_id) {
      return res.status(400).json({
        error: 'Project ID is required'
      });
    }
    
    console.log(`[AbyssaleAPI] User ${req.user?.id} duplicating template: ${templateId} to project: ${project_id}`);
    
    const duplicateData = {
      project_id,
      ...(name && { name })
    };
    
    const result = await abyssaleClient.duplicateWorkspaceTemplate(templateId, duplicateData);
    
    res.json({
      success: true,
      data: result,
      message: 'Template duplication initiated successfully'
    });
  } catch (error) {
    console.error('[AbyssaleAPI] Error duplicating template:', error);
    res.status(500).json({
      error: 'Failed to duplicate template',
      message: error.message
    });
  }
});

/**
 * Get duplication request status
 * GET /api/abyssale/duplication-requests/:requestId
 */
router.get('/duplication-requests/:requestId', requireAuth, checkAbyssaleConfig, async (req, res) => {
  try {
    const { requestId } = req.params;
    
    if (!requestId) {
      return res.status(400).json({
        error: 'Request ID is required'
      });
    }
    
    console.log(`[AbyssaleAPI] User ${req.user?.id} checking duplication request: ${requestId}`);
    
    const status = await abyssaleClient.getDuplicationRequestStatus(requestId);
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('[AbyssaleAPI] Error fetching duplication status:', error);
    res.status(500).json({
      error: 'Failed to fetch duplication status',
      message: error.message
    });
  }
});

/**
 * Serve locally stored generated images
 * GET /api/abyssale/images/:bannerId
 */
router.get('/images/:bannerId', async (req, res) => {
  try {
    const { bannerId } = req.params;
    
    if (!bannerId) {
      return res.status(400).json({
        error: 'Banner ID is required'
      });
    }
    
    console.log(`[AbyssaleAPI] Serving local image: ${bannerId}`);
    
    // Look for the image in the uploads directory structure
    const fs = require('fs');
    const path = require('path');
    
    // Search pattern: uploads/abyssale/*/bannerId.*
    const searchPattern = path.join(process.cwd(), 'uploads', 'abyssale', '*', `${bannerId}.*`);
    const files = glob.sync(searchPattern);
    
    if (files.length === 0) {
      return res.status(404).json({
        error: 'Image not found',
        message: `No local image found for banner ID: ${bannerId}`
      });
    }
    
    const filePath = files[0]; // Use the first match
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    // Set appropriate content type
    let contentType = 'application/octet-stream';
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.webp':
        contentType = 'image/webp';
        break;
      case '.avif':
        contentType = 'image/avif';
        break;
      case '.pdf':
        contentType = 'application/pdf';
        break;
    }
    
    // Set headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.setHeader('Last-Modified', stats.mtime.toUTCString());
    
    // Stream the file
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
    
    console.log(`[AbyssaleAPI] Served image: ${path.basename(filePath)} (${stats.size} bytes)`);
    
  } catch (error) {
    console.error('[AbyssaleAPI] Error serving image:', error);
    res.status(500).json({
      error: 'Failed to serve image',
      message: error.message
    });
  }
});

/**
 * List locally stored images
 * GET /api/abyssale/images
 */
router.get('/images', async (req, res) => {
  try {
    console.log('[AbyssaleAPI] Listing local images');
    
    const fs = require('fs');
    const path = require('path');
    
    // Search pattern: uploads/abyssale/*/*.*
    const searchPattern = path.join(process.cwd(), 'uploads', 'abyssale', '*', '*.*');
    const files = glob.sync(searchPattern);
    
    const images = files.map(filePath => {
      const stats = fs.statSync(filePath);
      const filename = path.basename(filePath);
      const bannerId = path.parse(filename).name;
      const dateDir = path.basename(path.dirname(filePath));
      
      return {
        bannerId,
        filename,
        date: dateDir,
        size: stats.size,
        url: `/api/abyssale/images/${bannerId}`,
        createdAt: stats.mtime.toISOString(),
        path: path.relative(process.cwd(), filePath)
      };
    });
    
    // Sort by creation date (newest first)
    images.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({
      success: true,
      data: images,
      count: images.length
    });
    
  } catch (error) {
    console.error('[AbyssaleAPI] Error listing images:', error);
    res.status(500).json({
      error: 'Failed to list images',
      message: error.message
    });
  }
});

/**
 * Health check endpoint
 * GET /api/abyssale/health
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'abyssale',
    configured: abyssaleClient.isApiConfigured(),
    timestamp: new Date().toISOString()
  });
});

export default router;