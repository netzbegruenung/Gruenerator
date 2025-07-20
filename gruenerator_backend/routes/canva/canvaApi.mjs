import express from 'express';
import passport from '../../config/passportSetup.mjs';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import CanvaApiClient from '../../services/canvaApiClient.js';
import CanvaTokenManager from '../../utils/canvaTokenManager.js';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

// Add Passport session middleware for Canva API routes
router.use(passport.session());

// Add debugging middleware to all Canva API routes
router.use((req, res, next) => {
  console.log(`[Canva API] ${req.method} ${req.originalUrl} - User: ${req.user?.id}`);
  next();
});

/**
 * Get Canva API configuration status (does not require configuration)
 * GET /api/canva/status
 */
router.get('/status', (req, res) => {
  const isConfigured = CanvaTokenManager.validateConfiguration();
  res.json({
    success: true,
    configured: isConfigured,
    message: isConfigured ? 'Canva API is configured and ready' : 'Canva API is not configured - required environment variables missing'
  });
});

// Configuration validation middleware for all other routes
router.use((req, res, next) => {
  if (!CanvaTokenManager.validateConfiguration()) {
    return res.status(503).json({
      success: false,
      error: 'Canva integration not configured',
      details: 'Canva API features require CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, and CANVA_REDIRECT_URI to be configured on the server'
    });
  }
  next();
});

/**
 * Middleware to ensure user has valid Canva connection
 */
async function requireCanvaConnection(req, res, next) {
  try {
    const accessToken = await CanvaTokenManager.getValidAccessToken(req.user.id);
    
    if (!accessToken) {
      return res.status(401).json({
        success: false,
        error: 'Canva account not connected',
        message: 'Please connect your Canva account first',
        reconnect_required: true
      });
    }
    
    // Create Canva API client for this request
    req.canvaClient = CanvaApiClient.forUser(accessToken);
    next();
    
  } catch (error) {
    console.error('[Canva API] Error checking Canva connection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify Canva connection',
      details: error.message
    });
  }
}

/**
 * Test Canva API connection
 * GET /api/canva/test
 */
router.get('/test', ensureAuthenticated, requireCanvaConnection, async (req, res) => {
  try {
    console.log(`[Canva API] Connection test for user: ${req.user?.id}`);
    
    const isConnected = await req.canvaClient.testConnection();
    
    res.json({
      success: true,
      connected: isConnected,
      message: isConnected ? 'Canva API is reachable' : 'Canva API connection failed',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[Canva API] Connection test error:', error);
    res.status(500).json({
      success: false,
      connected: false,
      error: 'Failed to test Canva connection',
      details: error.message
    });
  }
});

/**
 * Get current user information from Canva
 * GET /api/canva/user
 */
router.get('/user', ensureAuthenticated, requireCanvaConnection, async (req, res) => {
  try {
    console.log(`[Canva API] Fetching user info for: ${req.user?.id}`);
    
    const canvaUser = await req.canvaClient.getCurrentUser();
    
    res.json({
      success: true,
      user: canvaUser
    });
    
  } catch (error) {
    console.error('[Canva API] Error fetching user info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Canva user information',
      details: error.message
    });
  }
});

/**
 * List user's designs with pagination
 * GET /api/canva/designs
 */
router.get('/designs', ensureAuthenticated, requireCanvaConnection, async (req, res) => {
  try {
    const { 
      limit = 10, 
      continuation_token,
      ownership,
      query
    } = req.query;
    
    console.log(`[Canva API] Listing designs for user: ${req.user?.id}`, {
      limit: parseInt(limit),
      hasToken: !!continuation_token,
      ownership,
      query
    });
    
    const options = {
      limit: Math.min(parseInt(limit), 50), // Cap at 50
      ...(continuation_token && { continuation_token }),
      ...(ownership && { ownership }),
      ...(query && { query })
    };
    
    const result = await req.canvaClient.listDesigns(options);
    
    res.json({
      success: true,
      designs: result.designs,
      has_more: result.has_more,
      continuation_token: result.continuation_token,
      total_count: result.designs.length
    });
    
  } catch (error) {
    console.error('[Canva API] Error listing designs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list designs',
      details: error.message
    });
  }
});

/**
 * Get specific design by ID
 * GET /api/canva/designs/:designId
 */
router.get('/designs/:designId', ensureAuthenticated, requireCanvaConnection, async (req, res) => {
  try {
    const { designId } = req.params;
    
    console.log(`[Canva API] Fetching design ${designId} for user: ${req.user?.id}`);
    
    const design = await req.canvaClient.getDesign(designId);
    
    res.json({
      success: true,
      design
    });
    
  } catch (error) {
    console.error('[Canva API] Error fetching design:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch design',
      details: error.message
    });
  }
});

/**
 * Create a new design
 * POST /api/canva/designs
 */
router.post('/designs', ensureAuthenticated, requireCanvaConnection, async (req, res) => {
  try {
    const { title, design_type, template_id, ...options } = req.body;
    
    // Validate required fields
    if (!title || !design_type) {
      return res.status(400).json({
        success: false,
        error: 'Title and design_type are required'
      });
    }
    
    console.log(`[Canva API] Creating design "${title}" (${design_type}) for user: ${req.user?.id}`);
    
    const designData = {
      title,
      design_type,
      ...(template_id && { template_id }),
      ...options
    };
    
    const design = await req.canvaClient.createDesign(designData);
    
    res.json({
      success: true,
      design,
      message: 'Design created successfully'
    });
    
  } catch (error) {
    console.error('[Canva API] Error creating design:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create design',
      details: error.message
    });
  }
});

/**
 * List user's assets with pagination
 * GET /api/canva/assets
 */
router.get('/assets', ensureAuthenticated, requireCanvaConnection, async (req, res) => {
  try {
    const { 
      limit = 10, 
      continuation_token,
      types,
      query
    } = req.query;
    
    console.log(`[Canva API] Listing assets for user: ${req.user?.id}`, {
      limit: parseInt(limit),
      hasToken: !!continuation_token,
      types,
      query
    });
    
    const options = {
      limit: Math.min(parseInt(limit), 50),
      ...(continuation_token && { continuation_token }),
      ...(types && { types: types.split(',') }),
      ...(query && { query })
    };
    
    const result = await req.canvaClient.listAssets(options);
    
    res.json({
      success: true,
      assets: result.assets,
      has_more: result.has_more,
      continuation_token: result.continuation_token,
      total_count: result.assets.length
    });
    
  } catch (error) {
    console.error('[Canva API] Error listing assets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list assets',
      details: error.message
    });
  }
});

/**
 * Get specific asset by ID
 * GET /api/canva/assets/:assetId
 */
router.get('/assets/:assetId', ensureAuthenticated, requireCanvaConnection, async (req, res) => {
  try {
    const { assetId } = req.params;
    
    console.log(`[Canva API] Fetching asset ${assetId} for user: ${req.user?.id}`);
    
    const asset = await req.canvaClient.getAsset(assetId);
    
    res.json({
      success: true,
      asset
    });
    
  } catch (error) {
    console.error('[Canva API] Error fetching asset:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch asset',
      details: error.message
    });
  }
});

/**
 * Upload an asset to Canva
 * POST /api/canva/assets/upload
 */
router.post('/assets/upload', ensureAuthenticated, requireCanvaConnection, async (req, res) => {
  try {
    const { name, upload_url, parent_folder_id, ...options } = req.body;
    
    // Validate required fields
    if (!name || !upload_url) {
      return res.status(400).json({
        success: false,
        error: 'Name and upload_url are required'
      });
    }
    
    console.log(`[Canva API] Uploading asset "${name}" for user: ${req.user?.id}`);
    
    const assetData = {
      name,
      upload_url,
      ...(parent_folder_id && { parent_folder_id }),
      ...options
    };
    
    const uploadJob = await req.canvaClient.uploadAsset(assetData);
    
    res.json({
      success: true,
      upload_job: uploadJob,
      message: 'Asset upload initiated successfully'
    });
    
  } catch (error) {
    console.error('[Canva API] Error uploading asset:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload asset',
      details: error.message
    });
  }
});

/**
 * Check upload job status
 * GET /api/canva/assets/upload/:jobId
 */
router.get('/assets/upload/:jobId', ensureAuthenticated, requireCanvaConnection, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    console.log(`[Canva API] Checking upload job ${jobId} for user: ${req.user?.id}`);
    
    const job = await req.canvaClient.getUploadJobStatus(jobId);
    
    res.json({
      success: true,
      job
    });
    
  } catch (error) {
    console.error('[Canva API] Error checking upload job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check upload job status',
      details: error.message
    });
  }
});

/**
 * Create design from Grünerator content
 * POST /api/canva/create-from-content
 */
router.post('/create-from-content', ensureAuthenticated, requireCanvaConnection, async (req, res) => {
  try {
    const { 
      content, 
      title, 
      design_type = 'social_media_post',
      template_id,
      brand_template_id 
    } = req.body;
    
    // Validate required fields
    if (!content || !title) {
      return res.status(400).json({
        success: false,
        error: 'Content and title are required'
      });
    }
    
    console.log(`[Canva API] Creating design from Grünerator content for user: ${req.user?.id}`);
    console.log(`[Canva API] Content preview: ${content.substring(0, 100)}...`);
    
    // Create design with content
    const designData = {
      title: `${title} - Grünerator`,
      design_type,
      ...(template_id && { template_id }),
      ...(brand_template_id && { brand_template_id })
    };
    
    const design = await req.canvaClient.createDesign(designData);
    
    // TODO: In future versions, we could add text elements to the design
    // For now, we create an empty design that users can edit
    
    res.json({
      success: true,
      design,
      message: 'Design created successfully from Grünerator content',
      content_preview: content.substring(0, 200),
      edit_url: design.urls?.edit_url
    });
    
  } catch (error) {
    console.error('[Canva API] Error creating design from content:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create design from content',
      details: error.message
    });
  }
});

/**
 * Get design types and templates available for the user
 * GET /api/canva/design-types
 */
router.get('/design-types', ensureAuthenticated, requireCanvaConnection, async (req, res) => {
  try {
    console.log(`[Canva API] Fetching design types for user: ${req.user?.id}`);
    
    // Common design types for Grünerator use cases
    const commonDesignTypes = [
      {
        id: 'social_media_post',
        name: 'Social Media Post',
        description: 'Square posts for social media platforms',
        dimensions: { width: 1080, height: 1080 }
      },
      {
        id: 'instagram_story',
        name: 'Instagram Story',
        description: 'Vertical stories for Instagram and other platforms',
        dimensions: { width: 1080, height: 1920 }
      },
      {
        id: 'facebook_post',
        name: 'Facebook Post',
        description: 'Posts optimized for Facebook',
        dimensions: { width: 1200, height: 630 }
      },
      {
        id: 'twitter_post',
        name: 'Twitter/X Post',
        description: 'Posts optimized for Twitter/X',
        dimensions: { width: 1200, height: 675 }
      },
      {
        id: 'a4',
        name: 'A4 Document',
        description: 'Standard A4 document format',
        dimensions: { width: 2480, height: 3508 }
      },
      {
        id: 'presentation',
        name: 'Presentation',
        description: 'Presentation slides',
        dimensions: { width: 1920, height: 1080 }
      },
      {
        id: 'poster',
        name: 'Poster',
        description: 'Large format poster',
        dimensions: { width: 2480, height: 3508 }
      }
    ];
    
    res.json({
      success: true,
      design_types: commonDesignTypes,
      message: 'Design types retrieved successfully'
    });
    
  } catch (error) {
    console.error('[Canva API] Error fetching design types:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch design types',
      details: error.message
    });
  }
});

export default router;