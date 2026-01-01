import express from 'express';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import path from 'path';
import imagePickerService from '../services/imagePickerService.js';
import { enhanceWithAttribution } from '../utils/unsplashAttribution.js';
import { createLogger } from '../utils/logger.js';
const log = createLogger('imagePicker');


const router = express.Router();

/**
 * POST /api/image-picker/select
 * Selects the best background image for given text
 */
router.post('/select', async (req, res) => {
  try {
    const { text, type, tags, maxCandidates } = req.body;

    // Validate input
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({
        error: 'Valid text is required for image selection',
        code: 'INVALID_TEXT'
      });
    }

    if (text.length > 2000) {
      return res.status(400).json({
        error: 'Text too long (max 2000 characters)',
        code: 'TEXT_TOO_LONG'
      });
    }

    // Prepare options
    const options = {};
    if (maxCandidates && typeof maxCandidates === 'number' && maxCandidates > 0 && maxCandidates <= 20) {
      options.maxCandidates = maxCandidates;
    }

    log.debug(`[ImagePicker API] Request for text: "${text.substring(0, 50)}..." (type: ${type || 'not specified'})`);

    // Call the image picker service
    const result = await imagePickerService.selectBestImage(text, req.app.locals.aiWorkerPool, options, req);

    // Format response
    const response = {
      success: true,
      selectedImage: {
        filename: result.selectedImage.filename,
        category: result.selectedImage.category,
        tags: result.selectedImage.tags,
        alt_text: result.selectedImage.alt_text,
        path: `/api/image-picker/stock-image/${result.selectedImage.filename}`
      },
      confidence: result.confidence,
      reasoning: result.reasoning,
      alternatives: result.alternatives.map(alt => ({
        filename: alt.filename,
        category: alt.category,
        tags: alt.tags,
        alt_text: alt.alt_text,
        path: `/api/image-picker/stock-image/${alt.filename}`
      })),
      metadata: {
        totalImages: result.metadata.totalImages,
        candidatesFound: result.metadata.candidatesFound,
        detectedThemes: result.metadata.themes,
        extractedKeywords: result.metadata.keywords,
        processingTime: new Date().toISOString()
      }
    };

    log.debug(`[ImagePicker API] Selected: ${result.selectedImage.filename} (confidence: ${result.confidence})`);

    res.json(response);

  } catch (error) {
    log.error('[ImagePicker API] Error:', error);

    res.status(500).json({
      error: 'Internal server error during image selection',
      code: 'SELECTION_ERROR',
      message: error.message,
      success: false
    });
  }
});

/**
 * GET /api/image-picker/stats
 * Get service statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = imagePickerService.getStats();

    res.json({
      success: true,
      stats: {
        ...stats,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    log.error('[ImagePicker API] Stats error:', error);

    res.status(500).json({
      error: 'Failed to get service statistics',
      code: 'STATS_ERROR',
      success: false
    });
  }
});

/**
 * GET /api/image-picker/catalog
 * Get the full image catalog (for debugging)
 */
router.get('/catalog', async (req, res) => {
  try {
    await imagePickerService.initialize();
    const catalog = imagePickerService.imageCatalog;

    res.json({
      success: true,
      catalog,
      count: catalog?.images?.length || 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    log.error('[ImagePicker API] Catalog error:', error);

    res.status(500).json({
      error: 'Failed to get image catalog',
      code: 'CATALOG_ERROR',
      success: false
    });
  }
});

/**
 * POST /api/image-picker/clear-cache
 * Clear the selection cache (for testing/debugging)
 */
router.post('/clear-cache', async (req, res) => {
  try {
    imagePickerService.clearCache();

    res.json({
      success: true,
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    log.error('[ImagePicker API] Clear cache error:', error);

    res.status(500).json({
      error: 'Failed to clear cache',
      code: 'CACHE_CLEAR_ERROR',
      success: false
    });
  }
});

/**
 * POST /api/image-picker/validate
 * Validate that an image file exists
 */
router.post('/validate', async (req, res) => {
  try {
    const { filename } = req.body;

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({
        error: 'Valid filename is required',
        code: 'INVALID_FILENAME',
        success: false
      });
    }

    const exists = await imagePickerService.validateImageExists(filename);
    const imagePath = imagePickerService.getImagePath(filename);

    res.json({
      success: true,
      filename,
      exists,
      path: exists ? `/api/image-picker/stock-image/${filename}` : null,
      fullPath: imagePath,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    log.error('[ImagePicker API] Validate error:', error);

    res.status(500).json({
      error: 'Failed to validate image',
      code: 'VALIDATION_ERROR',
      success: false
    });
  }
});

/**
 * GET /api/image-picker/stock-catalog
 * Get stock images with proper Unsplash attribution for frontend display
 */
router.get('/stock-catalog', async (req, res) => {
  try {
    const { category } = req.query;

    await imagePickerService.initialize();
    const catalog = imagePickerService.imageCatalog;

    if (!catalog?.images) {
      return res.status(404).json({
        success: false,
        error: 'Image catalog not found',
        code: 'CATALOG_NOT_FOUND'
      });
    }

    let images = catalog.images.map(enhanceWithAttribution);

    if (category && category !== 'all') {
      images = images.filter(img => img.category === category);
    }

    const categories = [...new Set(catalog.images.map(img => img.category))].sort();

    res.json({
      success: true,
      images,
      count: images.length,
      totalCount: catalog.images.length,
      categories,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    log.error('[ImagePicker API] Stock catalog error:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to get stock image catalog',
      code: 'STOCK_CATALOG_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/image-picker/stock-image/:filename
 * Serves a stock image file directly (used for dev proxy compatibility)
 * Query params: ?size=thumb for 400px thumbnail
 */
router.get('/stock-image/:filename', (req, res) => {
  const { filename } = req.params;
  const { size } = req.query;
  const sanitizedFilename = path.basename(filename);

  let imagePath;
  if (size === 'thumb') {
    const thumbName = sanitizedFilename.replace(/\.\w+$/, '.jpg');
    imagePath = path.join(__dirname, '../public/sharepic_example_bg/thumbs', thumbName);
  } else {
    imagePath = path.join(__dirname, '../public/sharepic_example_bg', sanitizedFilename);
  }

  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(imagePath, (err) => {
    if (err) {
      log.error('[ImagePicker API] Stock image serve error:', err);
      res.status(404).json({ error: 'Image not found' });
    }
  });
});

export default router;