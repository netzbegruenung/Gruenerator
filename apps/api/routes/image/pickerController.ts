/**
 * Image Picker Controller
 * Handles AI-powered image selection from stock catalog
 */

import express, { Response, Router } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import ImageSelectionService from '../../services/image/ImageSelectionService.js';
import { enhanceWithAttribution } from '../../services/image/index.js';
import { createLogger } from '../../utils/logger.js';
import type {
  AuthenticatedRequest,
  ImageSelectRequestBody,
  ImageValidateRequestBody,
  ImageSelectResponse,
  ImagePickerStatsResponse,
  ImageCatalogResponse,
  CacheClearResponse,
  ImageValidateResponse,
  StockCatalogResponse,
  StockCatalogQuery,
  StockImageQuery
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('imagePicker');
const router: Router = express.Router();
const imagePickerService = ImageSelectionService;

/**
 * POST /select
 * Selects the best background image for given text
 */
router.post('/select', async (req: AuthenticatedRequest, res: Response<ImageSelectResponse>) => {
  try {
    const { text, type, tags, maxCandidates } = req.body as ImageSelectRequestBody;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid text is required for image selection',
        code: 'INVALID_TEXT'
      });
    }

    if (text.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Text too long (max 2000 characters)',
        code: 'TEXT_TOO_LONG'
      });
    }

    const options: { maxCandidates?: number } = {};
    if (maxCandidates && typeof maxCandidates === 'number' && maxCandidates > 0 && maxCandidates <= 20) {
      options.maxCandidates = maxCandidates;
    }

    log.debug(`[ImagePicker API] Request for text: "${text.substring(0, 50)}..." (type: ${type || 'not specified'})`);

    const result = await imagePickerService.selectBestImage(text, req.app.locals.aiWorkerPool, options, req);

    const response: ImageSelectResponse = {
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
      alternatives: result.alternatives.map((alt: any) => ({
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

    return res.json(response);
  } catch (error) {
    log.error('[ImagePicker API] Error:', error);
    const err = error as Error;

    return res.status(500).json({
      success: false,
      error: 'Internal server error during image selection',
      code: 'SELECTION_ERROR',
      message: err.message
    });
  }
});

/**
 * GET /stats
 * Get service statistics
 */
router.get('/stats', async (_req: AuthenticatedRequest, res: Response<ImagePickerStatsResponse>) => {
  try {
    const stats = imagePickerService.getStats();

    return res.json({
      success: true,
      stats: {
        ...stats,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    log.error('[ImagePicker API] Stats error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to get service statistics',
      code: 'STATS_ERROR'
    });
  }
});

/**
 * GET /catalog
 * Get the full image catalog (for debugging)
 */
router.get('/catalog', async (_req: AuthenticatedRequest, res: Response<ImageCatalogResponse>) => {
  try {
    await imagePickerService.initialize();
    const catalog = imagePickerService.getCatalog();

    return res.json({
      success: true,
      catalog: catalog ?? undefined,
      count: catalog?.images?.length || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('[ImagePicker API] Catalog error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to get image catalog',
      code: 'CATALOG_ERROR'
    });
  }
});

/**
 * POST /clear-cache
 * Clear the selection cache (for testing/debugging)
 */
router.post('/clear-cache', async (_req: AuthenticatedRequest, res: Response<CacheClearResponse>) => {
  try {
    imagePickerService.clearCache();

    return res.json({
      success: true,
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('[ImagePicker API] Clear cache error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      code: 'CACHE_CLEAR_ERROR'
    });
  }
});

/**
 * POST /validate
 * Validate that an image file exists
 */
router.post('/validate', async (req: AuthenticatedRequest, res: Response<ImageValidateResponse>) => {
  try {
    const { filename } = req.body as ImageValidateRequestBody;

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Valid filename is required',
        code: 'INVALID_FILENAME'
      });
    }

    const exists = await imagePickerService.validateImageExists(filename);
    const imagePath = imagePickerService.getImagePath(filename);

    return res.json({
      success: true,
      filename,
      exists,
      path: exists ? `/api/image-picker/stock-image/${filename}` : null,
      fullPath: imagePath,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('[ImagePicker API] Validate error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to validate image',
      code: 'VALIDATION_ERROR'
    });
  }
});

/**
 * GET /stock-catalog
 * Get stock images with proper Unsplash attribution for frontend display
 */
router.get('/stock-catalog', async (req: AuthenticatedRequest, res: Response<StockCatalogResponse>) => {
  try {
    const { category } = req.query as StockCatalogQuery;

    await imagePickerService.initialize();
    const catalog = imagePickerService.getCatalog();

    if (!catalog?.images) {
      return res.status(404).json({
        success: false,
        error: 'Image catalog not found',
        code: 'CATALOG_NOT_FOUND'
      });
    }

    let images = catalog.images.map(enhanceWithAttribution);

    if (category && category !== 'all') {
      images = images.filter((img) => img.category === category);
    }

    const categories = [...new Set(catalog.images.map((img) => img.category))].sort();

    return res.json({
      success: true,
      images: images as any,
      count: images.length,
      totalCount: catalog.images.length,
      categories,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('[ImagePicker API] Stock catalog error:', error);
    const err = error as Error;

    return res.status(500).json({
      success: false,
      error: 'Failed to get stock image catalog',
      code: 'STOCK_CATALOG_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /download-track
 * Track Unsplash image download (required by Unsplash API guidelines)
 * Called when user selects an image for use in canvas
 */
router.post('/download-track', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filename, downloadLocation } = req.body;

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Valid filename is required',
        code: 'INVALID_FILENAME'
      });
    }

    // Only track if downloadLocation exists (real Unsplash images)
    // Local stock images won't have this field
    if (downloadLocation && typeof downloadLocation === 'string') {
      try {
        // Make request to Unsplash download endpoint
        // This doesn't return useful data, it's just for tracking
        await fetch(downloadLocation);
        log.debug(`[ImagePicker API] Download tracked for ${filename}`);
      } catch (error) {
        log.warn(`[ImagePicker API] Failed to track download for ${filename}:`, error);
        // Don't fail the request if tracking fails
      }
    }

    return res.json({
      success: true,
      tracked: !!downloadLocation,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('[ImagePicker API] Download track error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to track download',
      code: 'DOWNLOAD_TRACK_ERROR'
    });
  }
});

/**
 * GET /stock-image/:filename
 * Serves a stock image file directly (used for dev proxy compatibility)
 * Query params: ?size=thumb for 400px thumbnail
 */
router.get('/stock-image/:filename', (req: AuthenticatedRequest, res: Response) => {
  const { filename } = req.params;
  const { size } = req.query as StockImageQuery;
  const sanitizedFilename = basename(filename);

  let imagePath: string;
  if (size === 'thumb') {
    const thumbName = sanitizedFilename.replace(/\.\w+$/, '.jpg');
    imagePath = join(__dirname, '../../public/sharepic_example_bg/thumbs', thumbName);
  } else {
    imagePath = join(__dirname, '../../public/sharepic_example_bg', sanitizedFilename);
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
