/**
 * Canva-specific Authentication Middleware
 * 
 * Provides middleware functions for Canva Connect API operations,
 * including token validation, automatic refresh, and connection status checks.
 */

const CanvaTokenManager = require('../utils/canvaTokenManager.js');
const CanvaApiClient = require('../services/canvaApiClient.js');

/**
 * Middleware to ensure user has a valid Canva connection
 * Automatically handles token refresh if needed
 */
async function requireCanvaConnection(req, res, next) {
  try {
    console.log(`[CanvaAuthMiddleware] Checking Canva connection for user: ${req.user?.id}`);
    
    // Ensure user is authenticated first
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required',
        message: 'Please log in to access Canva features'
      });
    }
    
    // Get valid access token (handles refresh automatically)
    const accessToken = await CanvaTokenManager.getValidAccessToken(req.user.id);
    
    if (!accessToken) {
      console.log(`[CanvaAuthMiddleware] No valid Canva token for user: ${req.user.id}`);
      return res.status(401).json({
        success: false,
        error: 'Canva account not connected',
        message: 'Please connect your Canva account to use this feature',
        reconnect_required: true,
        auth_url: '/api/canva/auth/authorize'
      });
    }
    
    // Create Canva API client for this request
    req.canvaClient = CanvaApiClient.forUser(accessToken);
    req.canvaAccessToken = accessToken;
    
    console.log(`[CanvaAuthMiddleware] Canva connection validated for user: ${req.user.id}`);
    next();
    
  } catch (error) {
    console.error('[CanvaAuthMiddleware] Error checking Canva connection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify Canva connection',
      details: error.message,
      reconnect_required: true
    });
  }
}

/**
 * Middleware to check if user has Canva connection (non-blocking)
 * Sets req.hasCanvaConnection flag without blocking the request
 */
async function checkCanvaConnection(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      req.hasCanvaConnection = false;
      req.canvaClient = null;
      return next();
    }
    
    console.log(`[CanvaAuthMiddleware] Checking optional Canva connection for user: ${req.user.id}`);
    
    const accessToken = await CanvaTokenManager.getValidAccessToken(req.user.id);
    
    if (accessToken) {
      req.hasCanvaConnection = true;
      req.canvaClient = CanvaApiClient.forUser(accessToken);
      req.canvaAccessToken = accessToken;
      console.log(`[CanvaAuthMiddleware] Optional Canva connection available for user: ${req.user.id}`);
    } else {
      req.hasCanvaConnection = false;
      req.canvaClient = null;
      console.log(`[CanvaAuthMiddleware] No Canva connection for user: ${req.user.id}`);
    }
    
    next();
    
  } catch (error) {
    console.error('[CanvaAuthMiddleware] Error in optional Canva check:', error);
    // Don't block the request for optional checks
    req.hasCanvaConnection = false;
    req.canvaClient = null;
    next();
  }
}

/**
 * Middleware to validate specific Canva scopes are available
 * @param {string[]} requiredScopes - Array of required scope strings
 */
function requireCanvaScopes(requiredScopes) {
  return async (req, res, next) => {
    try {
      console.log(`[CanvaAuthMiddleware] Checking scopes for user: ${req.user?.id}`, requiredScopes);
      
      // Ensure user has Canva connection first
      if (!req.canvaClient) {
        return res.status(401).json({
          success: false,
          error: 'Canva account not connected',
          message: 'Please connect your Canva account first',
          reconnect_required: true
        });
      }
      
      // Get user's current scopes from database
      const { getProfileService } = await import('../services/ProfileService.mjs');
      const profileService = getProfileService();
      const profile = await profileService.getProfileById(req.user.id);
      
      if (!profile) {
        throw new Error(`Profile not found for user: ${req.user.id}`);
      }
      
      const userScopes = profile.canva_scopes || [];
      const missingScopes = requiredScopes.filter(scope => !userScopes.includes(scope));
      
      if (missingScopes.length > 0) {
        console.log(`[CanvaAuthMiddleware] Missing scopes for user ${req.user.id}:`, missingScopes);
        return res.status(403).json({
          success: false,
          error: 'Insufficient Canva permissions',
          message: 'Your Canva connection does not have the required permissions for this operation',
          missing_scopes: missingScopes,
          reconnect_required: true,
          reconnect_message: 'Please reconnect your Canva account with additional permissions'
        });
      }
      
      console.log(`[CanvaAuthMiddleware] All required scopes available for user: ${req.user.id}`);
      next();
      
    } catch (error) {
      console.error('[CanvaAuthMiddleware] Error checking scopes:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify Canva permissions',
        details: error.message
      });
    }
  };
}

/**
 * Middleware to handle Canva API errors and token refresh
 */
function handleCanvaErrors(req, res, next) {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Parse response if it's JSON
    let responseData;
    try {
      responseData = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) {
      return originalSend.call(this, data);
    }
    
    // Check for Canva authentication errors
    if (responseData && responseData.error) {
      const errorMessage = responseData.error.toLowerCase();
      
      if (errorMessage.includes('unauthorized') || 
          errorMessage.includes('invalid_token') ||
          errorMessage.includes('token_expired')) {
        
        console.log(`[CanvaAuthMiddleware] Detected token error for user: ${req.user?.id}`);
        
        // Clear invalid tokens in background
        if (req.user?.id) {
          CanvaTokenManager.clearTokens(req.user.id)
            .catch(error => console.error('[CanvaAuthMiddleware] Error clearing invalid tokens:', error));
        }
        
        // Modify response to indicate reconnection needed
        responseData.reconnect_required = true;
        responseData.auth_url = '/api/canva/auth/authorize';
        
        return originalSend.call(this, JSON.stringify(responseData));
      }
    }
    
    return originalSend.call(this, data);
  };
  
  next();
}

/**
 * Middleware to add Canva connection status to response
 */
async function addCanvaStatus(req, res, next) {
  try {
    if (req.user && req.user.id) {
      const hasConnection = await CanvaTokenManager.hasValidConnection(req.user.id);
      
      // Add to response headers or body as needed
      res.locals.canvaConnected = hasConnection;
      
      // Add to API responses
      const originalJson = res.json;
      res.json = function(data) {
        if (data && typeof data === 'object') {
          data.canva_status = {
            connected: hasConnection,
            features_available: hasConnection
          };
        }
        return originalJson.call(this, data);
      };
    }
    
    next();
    
  } catch (error) {
    console.error('[CanvaAuthMiddleware] Error adding Canva status:', error);
    // Don't block request for status addition errors
    next();
  }
}

/**
 * Rate limiting middleware for Canva API calls
 * Implements basic rate limiting to respect Canva's API limits
 */
function canvaRateLimit(options = {}) {
  const { 
    maxRequests = 100, 
    windowMs = 60000, // 1 minute
    skipSuccessfulGets = true 
  } = options;
  
  const userRequests = new Map();
  
  return (req, res, next) => {
    if (!req.user || !req.user.id) {
      return next();
    }
    
    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean up old entries
    if (!userRequests.has(userId)) {
      userRequests.set(userId, []);
    }
    
    const requests = userRequests.get(userId);
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);
    
    // Skip rate limiting for successful GET requests if configured
    if (skipSuccessfulGets && req.method === 'GET') {
      recentRequests.push(now);
      userRequests.set(userId, recentRequests);
      return next();
    }
    
    if (recentRequests.length >= maxRequests) {
      console.warn(`[CanvaAuthMiddleware] Rate limit exceeded for user: ${userId}`);
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        message: 'Too many Canva API requests. Please try again later.',
        retry_after: Math.ceil(windowMs / 1000)
      });
    }
    
    recentRequests.push(now);
    userRequests.set(userId, recentRequests);
    
    next();
  };
}

module.exports = {
  requireCanvaConnection,
  checkCanvaConnection,
  requireCanvaScopes,
  handleCanvaErrors,
  addCanvaStatus,
  canvaRateLimit
};
