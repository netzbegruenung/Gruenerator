/**
 * Unsplash API Routes
 *
 * Provides REST endpoints for Unsplash photo search and download tracking.
 * Acts as a backend proxy to keep API keys confidential.
 *
 * Endpoints:
 * - GET  /api/unsplash/search - Search Unsplash photos
 * - POST /api/unsplash/track-download - Track photo download (API compliance)
 * - GET  /api/unsplash/stats - Get service statistics
 */

import express, { Request, Response } from 'express';
import {
  getUnsplashService,
  UnsplashApiError,
  UnsplashRateLimitError,
} from '../../services/unsplash/UnsplashApiService.js';

const router = express.Router();

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/unsplash/search
 *
 * Search Unsplash photos
 *
 * Query Parameters:
 * - query: Search query (required)
 * - page: Page number (default: 1)
 * - per_page: Results per page (default: 20, max: 30)
 *
 * Response:
 * {
 *   results: StockImage[],
 *   total: number,
 *   total_pages: number
 * }
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { query, page, per_page } = req.query;

    // Validate query parameter
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Missing or invalid query parameter',
        message: 'Query parameter is required and must be a non-empty string',
      });
    }

    // Parse and validate pagination parameters
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const perPage = per_page ? parseInt(per_page as string, 10) : 20;

    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        error: 'Invalid page parameter',
        message: 'Page must be a positive integer',
      });
    }

    if (isNaN(perPage) || perPage < 1 || perPage > 30) {
      return res.status(400).json({
        error: 'Invalid per_page parameter',
        message: 'per_page must be between 1 and 30',
      });
    }

    // Get service and perform search
    const service = getUnsplashService();
    const result = await service.searchPhotos(query.trim(), pageNum, perPage);

    return res.status(200).json(result);
  } catch (error) {
    console.error('[UnsplashRoutes] Search error:', error);

    if (error instanceof UnsplashRateLimitError) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Unsplash API rate limit reached. Please try again later.',
        retryAfter: 3600, // Unsplash resets hourly
      });
    }

    if (error instanceof UnsplashApiError) {
      return res.status(error.statusCode || 500).json({
        error: 'Unsplash API error',
        message: error.message,
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to search Unsplash photos',
    });
  }
});

/**
 * POST /api/unsplash/track-download
 *
 * Track photo download for Unsplash API compliance
 *
 * Body:
 * {
 *   downloadLocation: string - The download_location URL from photo.links
 * }
 *
 * Response:
 * {
 *   success: boolean
 * }
 */
router.post('/track-download', async (req: Request, res: Response) => {
  try {
    const { downloadLocation } = req.body;

    if (!downloadLocation || typeof downloadLocation !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid downloadLocation',
        message: 'downloadLocation is required and must be a string',
      });
    }

    // Track download (non-blocking)
    const service = getUnsplashService();
    await service.trackDownload(downloadLocation);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[UnsplashRoutes] Track download error:', error);

    // Don't fail the request even if tracking fails
    // This is intentionally non-blocking
    return res.status(200).json({
      success: false,
      warning: 'Download tracking failed but request succeeded',
    });
  }
});

/**
 * GET /api/unsplash/stats
 *
 * Get Unsplash service statistics
 *
 * Response:
 * {
 *   cache: { size: number }
 * }
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const service = getUnsplashService();
    const stats = service.getCacheStats();

    return res.status(200).json({
      cache: stats,
      service: 'Unsplash API',
      status: 'operational',
    });
  } catch (error) {
    console.error('[UnsplashRoutes] Stats error:', error);

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve service statistics',
    });
  }
});

/**
 * POST /api/unsplash/clear-cache
 *
 * Clear the search cache (debug/admin endpoint)
 *
 * Response:
 * {
 *   success: boolean,
 *   message: string
 * }
 */
router.post('/clear-cache', async (req: Request, res: Response) => {
  try {
    const service = getUnsplashService();
    service.clearCache();

    return res.status(200).json({
      success: true,
      message: 'Cache cleared successfully',
    });
  } catch (error) {
    console.error('[UnsplashRoutes] Clear cache error:', error);

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to clear cache',
    });
  }
});

// ============================================================================
// Export Router
// ============================================================================

export default router;
