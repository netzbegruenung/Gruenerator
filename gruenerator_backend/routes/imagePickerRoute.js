const express = require('express');
const imagePickerService = require('../services/imagePickerService');

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

    console.log(`[ImagePicker API] Request for text: "${text.substring(0, 50)}..." (type: ${type || 'not specified'})`);

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
        path: `/public/sharepic_example_bg/${result.selectedImage.filename}`
      },
      confidence: result.confidence,
      reasoning: result.reasoning,
      alternatives: result.alternatives.map(alt => ({
        filename: alt.filename,
        category: alt.category,
        tags: alt.tags,
        alt_text: alt.alt_text,
        path: `/public/sharepic_example_bg/${alt.filename}`
      })),
      metadata: {
        totalImages: result.metadata.totalImages,
        candidatesFound: result.metadata.candidatesFound,
        detectedThemes: result.metadata.themes,
        extractedKeywords: result.metadata.keywords,
        processingTime: new Date().toISOString()
      }
    };

    console.log(`[ImagePicker API] Selected: ${result.selectedImage.filename} (confidence: ${result.confidence})`);

    res.json(response);

  } catch (error) {
    console.error('[ImagePicker API] Error:', error);

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
    console.error('[ImagePicker API] Stats error:', error);

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
    console.error('[ImagePicker API] Catalog error:', error);

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
    console.error('[ImagePicker API] Clear cache error:', error);

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
      path: exists ? `/public/sharepic_example_bg/${filename}` : null,
      fullPath: imagePath,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[ImagePicker API] Validate error:', error);

    res.status(500).json({
      error: 'Failed to validate image',
      code: 'VALIDATION_ERROR',
      success: false
    });
  }
});

module.exports = router;