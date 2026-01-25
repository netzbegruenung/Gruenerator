/**
 * Canva API Routes
 *
 * Provides endpoints for interacting with Canva's Connect API,
 * including design creation, asset management, and user operations.
 */

import express, { Request, Response, NextFunction, Router } from 'express';
import passport from '../../config/passportSetup.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { requireCanvaConnection } from '../../middleware/canvaAuthMiddleware.js';
import { CanvaTokenManager } from '../../utils/integrations/canva/index.js';
import { createLogger } from '../../utils/logger.js';
import type { CanvaRequest } from '../../middleware/types.js';
import type {
  CanvaDesign,
  CanvaAsset,
  CanvaUser,
  UploadJob,
} from '../../services/api-clients/canvaApiClient.js';

const log = createLogger('canva');

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

// Add Passport session middleware for Canva API routes
router.use(passport.session());

// ============================================================================
// Type Definitions for API Responses
// ============================================================================

interface StatusResponse {
  success: boolean;
  configured: boolean;
  message: string;
}

interface TestResponse {
  success: boolean;
  connected: boolean;
  message?: string;
  timestamp?: string;
  error?: string;
  details?: string;
}

interface UserResponse {
  success: boolean;
  user?: CanvaUser;
  error?: string;
  details?: string;
}

interface DesignsListResponse {
  success: boolean;
  designs?: CanvaDesign[];
  has_more?: boolean;
  continuation_token?: string | null;
  total_count?: number;
  error?: string;
  details?: string;
}

interface DesignResponse {
  success: boolean;
  design?: CanvaDesign;
  message?: string;
  error?: string;
  details?: string;
}

interface AssetsListResponse {
  success: boolean;
  assets?: CanvaAsset[];
  has_more?: boolean;
  continuation_token?: string | null;
  total_count?: number;
  error?: string;
  details?: string;
}

interface AssetResponse {
  success: boolean;
  asset?: CanvaAsset;
  error?: string;
  details?: string;
}

interface UploadResponse {
  success: boolean;
  upload_job?: UploadJob;
  job?: UploadJob;
  message?: string;
  error?: string;
  details?: string;
}

interface DesignFromContentResponse {
  success: boolean;
  design?: CanvaDesign;
  message?: string;
  content_preview?: string;
  edit_url?: string;
  error?: string;
  details?: string;
}

interface DesignType {
  id: string;
  name: string;
  description: string;
  dimensions: {
    width: number;
    height: number;
  };
}

interface DesignTypesResponse {
  success: boolean;
  design_types?: DesignType[];
  message?: string;
  error?: string;
  details?: string;
}

// ============================================================================
// Query Parameter Types
// ============================================================================

interface DesignsQuery {
  limit?: string;
  continuation_token?: string;
  ownership?: string;
  query?: string;
}

interface AssetsQuery {
  limit?: string;
  continuation_token?: string;
  types?: string;
  query?: string;
}

// ============================================================================
// Request Body Types
// ============================================================================

interface CreateDesignBody {
  title: string;
  design_type: string;
  template_id?: string;
  [key: string]: unknown;
}

interface UploadAssetBody {
  name: string;
  upload_url: string;
  parent_folder_id?: string;
  [key: string]: unknown;
}

interface CreateFromContentBody {
  content: string;
  title: string;
  design_type?: string;
  template_id?: string;
  brand_template_id?: string;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * Get Canva API configuration status (does not require configuration)
 * GET /api/canva/status
 */
router.get('/status', (_req: Request, res: Response<StatusResponse>) => {
  const isConfigured = CanvaTokenManager.validateConfiguration();
  res.json({
    success: true,
    configured: isConfigured,
    message: isConfigured
      ? 'Canva API is configured and ready'
      : 'Canva API is not configured - required environment variables missing',
  });
});

// Configuration validation middleware for all other routes
router.use((req: Request, res: Response, next: NextFunction) => {
  if (!CanvaTokenManager.validateConfiguration()) {
    res.status(503).json({
      success: false,
      error: 'Canva integration not configured',
      details:
        'Canva API features require CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, and CANVA_REDIRECT_URI to be configured on the server',
    });
    return;
  }
  next();
});

/**
 * Test Canva API connection
 * GET /api/canva/test
 */
router.get(
  '/test',
  ensureAuthenticated,
  requireCanvaConnection,
  async (req: Request, res: Response<TestResponse>) => {
    try {
      const canvaReq = req as unknown as CanvaRequest;
      const isConnected = await canvaReq.canvaClient!.testConnection();

      res.json({
        success: true,
        connected: isConnected,
        message: isConnected ? 'Canva API is reachable' : 'Canva API connection failed',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('[Canva API] Connection test error:', error);
      res.status(500).json({
        success: false,
        connected: false,
        message: 'Failed to test Canva connection',
        error: 'Failed to test Canva connection',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * Get current user information from Canva
 * GET /api/canva/user
 */
router.get(
  '/user',
  ensureAuthenticated,
  requireCanvaConnection,
  async (req: Request, res: Response<UserResponse>) => {
    try {
      const canvaReq = req as unknown as CanvaRequest;
      const canvaUser = await canvaReq.canvaClient!.getCurrentUser();

      res.json({
        success: true,
        user: canvaUser,
      });
    } catch (error) {
      log.error('[Canva API] Error fetching user info:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch Canva user information',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * List user's designs with pagination
 * GET /api/canva/designs
 */
router.get(
  '/designs',
  ensureAuthenticated,
  requireCanvaConnection,
  async (req: Request, res: Response<DesignsListResponse>) => {
    try {
      const canvaReq = req as unknown as CanvaRequest;
      const { limit = '10', continuation_token, ownership, query } = req.query as DesignsQuery;

      const options = {
        limit: Math.min(parseInt(limit, 10), 50),
        ...(continuation_token && { continuation_token }),
        ...(ownership && { ownership }),
        ...(query && { query }),
      };

      const result = await canvaReq.canvaClient!.listDesigns(options);

      res.json({
        success: true,
        designs: result.designs,
        has_more: result.has_more,
        continuation_token: result.continuation_token,
        total_count: result.designs.length,
      });
    } catch (error) {
      log.error('[Canva API] Error listing designs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list designs',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * Get specific design by ID
 * GET /api/canva/designs/:designId
 */
router.get(
  '/designs/:designId',
  ensureAuthenticated,
  requireCanvaConnection,
  async (req: Request, res: Response<DesignResponse>) => {
    try {
      const canvaReq = req as unknown as CanvaRequest;
      const { designId } = req.params;

      const design = await canvaReq.canvaClient!.getDesign(designId);

      res.json({
        success: true,
        design,
      });
    } catch (error) {
      log.error('[Canva API] Error fetching design:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch design',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * Create a new design
 * POST /api/canva/designs
 */
router.post(
  '/designs',
  ensureAuthenticated,
  requireCanvaConnection,
  async (req: Request, res: Response<DesignResponse>) => {
    try {
      const canvaReq = req as unknown as CanvaRequest;
      const { title, design_type, template_id, ...options } = req.body as CreateDesignBody;

      if (!title || !design_type) {
        return res.status(400).json({
          success: false,
          error: 'Title and design_type are required',
        });
      }

      const designData = {
        title,
        design_type,
        ...(template_id && { template_id }),
        ...options,
      };

      const design = await canvaReq.canvaClient!.createDesign(designData);

      return res.json({
        success: true,
        design,
        message: 'Design created successfully',
      });
    } catch (error) {
      log.error('[Canva API] Error creating design:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create design',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * List user's assets with pagination
 * GET /api/canva/assets
 */
router.get(
  '/assets',
  ensureAuthenticated,
  requireCanvaConnection,
  async (req: Request, res: Response<AssetsListResponse>) => {
    try {
      const canvaReq = req as unknown as CanvaRequest;
      const { limit = '10', continuation_token, types, query } = req.query as AssetsQuery;

      const options = {
        limit: Math.min(parseInt(limit, 10), 50),
        ...(continuation_token && { continuation_token }),
        ...(types && { types: types.split(',') }),
        ...(query && { query }),
      };

      const result = await canvaReq.canvaClient!.listAssets(options);

      res.json({
        success: true,
        assets: result.assets,
        has_more: result.has_more,
        continuation_token: result.continuation_token,
        total_count: result.assets.length,
      });
    } catch (error) {
      log.error('[Canva API] Error listing assets:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list assets',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * Get specific asset by ID
 * GET /api/canva/assets/:assetId
 */
router.get(
  '/assets/:assetId',
  ensureAuthenticated,
  requireCanvaConnection,
  async (req: Request, res: Response<AssetResponse>) => {
    try {
      const canvaReq = req as unknown as CanvaRequest;
      const { assetId } = req.params;

      const asset = await canvaReq.canvaClient!.getAsset(assetId);

      res.json({
        success: true,
        asset,
      });
    } catch (error) {
      log.error('[Canva API] Error fetching asset:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch asset',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * Upload an asset to Canva
 * POST /api/canva/assets/upload
 */
router.post(
  '/assets/upload',
  ensureAuthenticated,
  requireCanvaConnection,
  async (req: Request, res: Response<UploadResponse>) => {
    try {
      const canvaReq = req as unknown as CanvaRequest;
      const { name, upload_url, parent_folder_id, ...options } = req.body as UploadAssetBody;

      if (!name || !upload_url) {
        return res.status(400).json({
          success: false,
          error: 'Name and upload_url are required',
        });
      }

      const assetData = {
        name,
        upload_url,
        ...(parent_folder_id && { parent_folder_id }),
        ...options,
      };

      const uploadJob = await canvaReq.canvaClient!.uploadAsset(assetData);

      return res.json({
        success: true,
        upload_job: uploadJob,
        message: 'Asset upload initiated successfully',
      });
    } catch (error) {
      log.error('[Canva API] Error uploading asset:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to upload asset',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * Check upload job status
 * GET /api/canva/assets/upload/:jobId
 */
router.get(
  '/assets/upload/:jobId',
  ensureAuthenticated,
  requireCanvaConnection,
  async (req: Request, res: Response<UploadResponse>) => {
    try {
      const canvaReq = req as unknown as CanvaRequest;
      const { jobId } = req.params;

      const job = await canvaReq.canvaClient!.getUploadJobStatus(jobId);

      res.json({
        success: true,
        job,
      });
    } catch (error) {
      log.error('[Canva API] Error checking upload job:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check upload job status',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * Create design from Grünerator content
 * POST /api/canva/create-from-content
 */
router.post(
  '/create-from-content',
  ensureAuthenticated,
  requireCanvaConnection,
  async (req: Request, res: Response<DesignFromContentResponse>) => {
    try {
      const canvaReq = req as unknown as CanvaRequest;
      const {
        content,
        title,
        design_type = 'social_media_post',
        template_id,
        brand_template_id,
      } = req.body as CreateFromContentBody;

      if (!content || !title) {
        return res.status(400).json({
          success: false,
          error: 'Content and title are required',
        });
      }

      const designData = {
        title: `${title} - Grünerator`,
        design_type,
        ...(template_id && { template_id }),
        ...(brand_template_id && { brand_template_id }),
      };

      const design = await canvaReq.canvaClient!.createDesign(designData);

      return res.json({
        success: true,
        design,
        message: 'Design created successfully from Grünerator content',
        content_preview: content.substring(0, 200),
        edit_url: design.urls?.edit_url,
      });
    } catch (error) {
      log.error('[Canva API] Error creating design from content:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create design from content',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * Get design types and templates available for the user
 * GET /api/canva/design-types
 */
router.get(
  '/design-types',
  ensureAuthenticated,
  requireCanvaConnection,
  async (_req: Request, res: Response<DesignTypesResponse>) => {
    try {
      const commonDesignTypes: DesignType[] = [
        {
          id: 'social_media_post',
          name: 'Social Media Post',
          description: 'Square posts for social media platforms',
          dimensions: { width: 1080, height: 1080 },
        },
        {
          id: 'instagram_story',
          name: 'Instagram Story',
          description: 'Vertical stories for Instagram and other platforms',
          dimensions: { width: 1080, height: 1920 },
        },
        {
          id: 'facebook_post',
          name: 'Facebook Post',
          description: 'Posts optimized for Facebook',
          dimensions: { width: 1200, height: 630 },
        },
        {
          id: 'twitter_post',
          name: 'Twitter/X Post',
          description: 'Posts optimized for Twitter/X',
          dimensions: { width: 1200, height: 675 },
        },
        {
          id: 'a4',
          name: 'A4 Document',
          description: 'Standard A4 document format',
          dimensions: { width: 2480, height: 3508 },
        },
        {
          id: 'presentation',
          name: 'Presentation',
          description: 'Presentation slides',
          dimensions: { width: 1920, height: 1080 },
        },
        {
          id: 'poster',
          name: 'Poster',
          description: 'Large format poster',
          dimensions: { width: 2480, height: 3508 },
        },
      ];

      res.json({
        success: true,
        design_types: commonDesignTypes,
        message: 'Design types retrieved successfully',
      });
    } catch (error) {
      log.error('[Canva API] Error fetching design types:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch design types',
        details: (error as Error).message,
      });
    }
  }
);

export default router;
