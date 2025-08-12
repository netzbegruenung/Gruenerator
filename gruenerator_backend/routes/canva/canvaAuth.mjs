import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import passport from '../../config/passportSetup.mjs';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { supabaseService } from '../../utils/supabaseClient.js';
// Import CanvaTokenManager and Redis OAuth State Manager using createRequire for CommonJS compatibility
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const CanvaTokenManager = require('../../utils/canvaTokenManager.js');
const redisOAuthStateManager = require('../../utils/redisOAuthStateManager.js');

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

// Validate configuration on module load
if (!CanvaTokenManager.validateConfiguration()) {
  console.error('[Canva Auth] Invalid Canva configuration - routes may not work correctly');
}

// Log Redis OAuth state manager availability
redisOAuthStateManager.getStats().then(stats => {
  console.log('[Canva Auth] Redis OAuth state manager status:', stats);
}).catch(err => {
  console.warn('[Canva Auth] Could not get Redis OAuth stats:', err.message);
});

// Add Passport session middleware for Canva auth routes
router.use(passport.session());

// Add debugging middleware to all Canva auth routes
router.use((req, res, next) => {
  console.log(`[Canva Auth] ${req.method} ${req.originalUrl} - Session ID: ${req.sessionID} - User: ${req.user?.id}`);
  next();
});

// Configuration validation middleware for critical routes
router.use('/authorize', (req, res, next) => {
  if (!CanvaTokenManager.validateConfiguration()) {
    return res.status(500).json({
      success: false,
      error: 'Canva integration not properly configured'
    });
  }
  next();
});

/**
 * Initiate Canva OAuth authorization with PKCE
 * GET /api/canva/auth/authorize
 */
router.get('/authorize', ensureAuthenticated, (req, res) => {
  try {
    console.log(`[Canva Auth] Authorization request by user: ${req.user?.id}`, {
      sessionId: req.sessionID,
      userAgent: req.headers['user-agent'],
      origin: req.headers.origin
    });
    
    // Generate PKCE values
    const codeVerifier = crypto.randomBytes(96).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    
    // Generate state for CSRF protection
    const state = crypto.randomBytes(96).toString('base64url');
    
    // Store PKCE values and user context in Redis for callback retrieval
    const oauthData = {
      userId: req.user.id,
      codeVerifier: codeVerifier,
      sessionId: req.sessionID // For debugging
    };
    
    console.log('[Canva Auth] Generated PKCE values and state', {
      sessionId: req.sessionID,
      userId: req.user.id,
      stateLength: state.length,
      codeVerifierLength: codeVerifier.length,
      redirectUri: process.env.CANVA_REDIRECT_URI
    });
    
    // Define required scopes based on our integration needs
    const scopes = [
      'asset:read',
      'asset:write', 
      'design:meta:read',
      'design:content:read',
      'design:content:write',
      'folder:read'
    ].join(' ');
    
    // Build authorization URL
    const authUrl = new URL('https://www.canva.com/api/oauth/authorize');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', process.env.CANVA_CLIENT_ID);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('redirect_uri', process.env.CANVA_REDIRECT_URI);
    
    console.log('[Canva Auth] Authorization URL generated for scopes:', scopes);
    
    // Store OAuth state in Redis (with fallback to session)
    const storeOAuthState = async () => {
      try {
        // Try Redis first
        const redisSuccess = await redisOAuthStateManager.storeState(state, oauthData);
        
        if (redisSuccess) {
          console.log('[Canva Auth] OAuth state stored in Redis successfully');
          return true;
        } else {
          // Fallback to session storage
          console.warn('[Canva Auth] Redis unavailable, falling back to session storage');
          req.session.canva_code_verifier = codeVerifier;
          req.session.canva_state = state;
          req.session.canva_user_id = req.user.id;
          
          return new Promise((resolve, reject) => {
            req.session.save((err) => {
              if (err) {
                console.error('[Canva Auth] Error saving session fallback:', err);
                reject(err);
              } else {
                console.log('[Canva Auth] Session fallback saved successfully');
                resolve(true);
              }
            });
          });
        }
      } catch (error) {
        console.error('[Canva Auth] Error storing OAuth state:', error);
        throw error;
      }
    };
    
    // Store state and respond
    storeOAuthState()
      .then(() => {
        res.json({
          success: true,
          authUrl: authUrl.toString(),
          state,
          scopes: scopes.split(' ')
        });
      })
      .catch((error) => {
        console.error('[Canva Auth] Failed to store OAuth state:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to store OAuth state'
        });
      });
    
  } catch (error) {
    console.error('[Canva Auth] Error in authorization:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate authorization URL',
      details: error.message
    });
  }
});

/**
 * Handle Canva OAuth callback
 * GET /api/canva/auth/callback
 * Note: No authentication required - OAuth callbacks arrive in different session context
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;
    
    console.log(`[Canva Auth] Callback received`, {
      sessionId: req.sessionID,
      hasCode: !!code,
      hasState: !!state,
      hasError: !!oauthError,
      statePreview: state ? state.substring(0, 20) + '...' : 'none'
    });
    
    // Validate required parameters first
    if (!code || !state) {
      console.error('[Canva Auth] Missing code or state in callback');
      return res.redirect(`${process.env.BASE_URL}/profile/inhalte/canva?canva_error=missing_parameters`);
    }
    
    // Retrieve OAuth state from Redis (with session fallback)
    let oauthData = null;
    let userId = null;
    let codeVerifier = null;
    
    try {
      // Try Redis first
      oauthData = await redisOAuthStateManager.retrieveState(state);
      
      if (oauthData) {
        console.log('[Canva Auth] OAuth state retrieved from Redis');
        userId = oauthData.userId;
        codeVerifier = oauthData.codeVerifier;
      } else {
        // Fallback to session storage
        console.warn('[Canva Auth] OAuth state not found in Redis, checking session fallback');
        
        const sessionState = req.session.canva_state;
        if (sessionState === state) {
          console.log('[Canva Auth] OAuth state found in session fallback');
          userId = req.session.canva_user_id;
          codeVerifier = req.session.canva_code_verifier;
          
          // Clean up session data
          delete req.session.canva_code_verifier;
          delete req.session.canva_state;
          delete req.session.canva_user_id;
        }
      }
      
    } catch (error) {
      console.error('[Canva Auth] Error retrieving OAuth state:', error);
    }
    
    // Validate that we have the necessary data
    if (!userId || !codeVerifier) {
      console.error('[Canva Auth] OAuth state not found or incomplete', {
        hasUserId: !!userId,
        hasCodeVerifier: !!codeVerifier,
        redisAvailable: redisOAuthStateManager.isAvailable()
      });
      return res.redirect(`${process.env.BASE_URL}/profile/inhalte/canva?canva_error=session_lost`);
    }
    
    // Handle OAuth errors
    if (oauthError) {
      console.error('[Canva Auth] OAuth error in callback:', oauthError);
      return res.redirect(`${process.env.BASE_URL}/profile/inhalte/canva?canva_error=${encodeURIComponent(oauthError)}`);
    }
    
    console.log('[Canva Auth] State verified, exchanging code for tokens');
    
    // Exchange authorization code for access token
    const tokenResponse = await exchangeCodeForTokens(code, codeVerifier);
    
    if (!tokenResponse.access_token) {
      throw new Error('No access token received from Canva');
    }
    
    console.log('[Canva Auth] Successfully received tokens from Canva');
    
    // Get user info from Canva to validate token and get user ID
    const canvaUser = await getCanvaUserInfo(tokenResponse.access_token);
    
    // Save tokens using CanvaTokenManager for consistent encryption
    await CanvaTokenManager.saveTokens(userId, tokenResponse);
    
    // Save additional Canva user info to profile
    await saveCanvaUserInfoToProfile(userId, {
      canva_user_id: canvaUser.id,
      canva_team_id: canvaUser.team_id,
      canva_display_name: canvaUser.display_name, // Will be null from /users/me
      canva_email: canvaUser.email // Will be null from /users/me
    });
    
    console.log(`[Canva Auth] Successfully connected Canva account for user: ${userId}`);
    
    // Redirect to Canva overview page with success indicator
    res.redirect(`${process.env.BASE_URL}/profile/inhalte/canva?canva_connected=true`);
    
  } catch (error) {
    console.error('[Canva Auth] Error in callback:', {
      error: error.message,
      sessionId: req.sessionID,
      redisAvailable: redisOAuthStateManager.isAvailable()
    });
    
    res.redirect(`${process.env.BASE_URL}/profile/inhalte/canva?canva_error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * Get current Canva connection status
 * GET /api/canva/auth/status
 */
router.get('/status', ensureAuthenticated, async (req, res) => {
  try {
    console.log(`[Canva Auth] Status check for user: ${req.user?.id}`);
    
    // Check if user has Canva tokens
    const { data: profile, error } = await supabaseService
      .from('profiles')
      .select('canva_access_token, canva_refresh_token, canva_token_expires_at, canva_user_id, canva_display_name, canva_email, canva_scopes')
      .eq('id', req.user.id)
      .single();
    
    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
    
    const hasConnection = !!(profile.canva_access_token && profile.canva_user_id);
    const isExpired = profile.canva_token_expires_at ? 
      new Date(profile.canva_token_expires_at) <= new Date() : true;
    
    console.log(`[Canva Auth] User ${req.user.id} connection status:`, {
      hasConnection,
      isExpired,
      canvaUserId: profile.canva_user_id
    });
    
    res.json({
      success: true,
      connected: hasConnection,
      expired: isExpired,
      canva_user: hasConnection ? {
        id: profile.canva_user_id,
        display_name: profile.canva_display_name,
        email: profile.canva_email
      } : null,
      scopes: profile.canva_scopes || [],
      expires_at: profile.canva_token_expires_at
    });
    
  } catch (error) {
    console.error('[Canva Auth] Error checking status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check Canva connection status',
      details: error.message
    });
  }
});

/**
 * Disconnect Canva account
 * POST /api/canva/auth/disconnect
 */
router.post('/disconnect', ensureAuthenticated, async (req, res) => {
  try {
    console.log(`[Canva Auth] Disconnect request for user: ${req.user?.id}`);
    
    // Clear Canva tokens from profile
    const { error } = await supabaseService
      .from('profiles')
      .update({
        canva_access_token: null,
        canva_refresh_token: null,
        canva_token_expires_at: null,
        canva_user_id: null,
        canva_display_name: null,
        canva_email: null,
        canva_scopes: null
      })
      .eq('id', req.user.id);
    
    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
    
    console.log(`[Canva Auth] Successfully disconnected Canva account for user: ${req.user.id}`);
    
    res.json({
      success: true,
      message: 'Canva account disconnected successfully'
    });
    
  } catch (error) {
    console.error('[Canva Auth] Error disconnecting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect Canva account',
      details: error.message
    });
  }
});

/**
 * Exchange authorization code for access tokens
 * @param {string} code - Authorization code from Canva
 * @param {string} codeVerifier - PKCE code verifier
 * @returns {Promise<Object>} Token response from Canva
 */
async function exchangeCodeForTokens(code, codeVerifier) {
  try {
    console.log('[Canva Auth] Exchanging authorization code for tokens');
    
    const credentials = Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString('base64');
    
    // Prepare form data as required by OAuth 2.0 specification
    const formData = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.CANVA_CLIENT_ID,
      code,
      code_verifier: codeVerifier,
      redirect_uri: process.env.CANVA_REDIRECT_URI
    });

    const response = await axios.post('https://api.canva.com/rest/v1/oauth/token', formData, {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    console.log('[Canva Auth] Token exchange successful');
    return response.data;
    
  } catch (error) {
    console.error('[Canva Auth] Token exchange failed:', error.response?.data || error.message);
    
    // Provide specific error messages for common OAuth issues
    if (error.response?.status === 400) {
      const errorData = error.response.data;
      if (errorData?.error === 'invalid_grant') {
        throw new Error('Authorization code expired or invalid. Please try again.');
      } else if (errorData?.error === 'invalid_client') {
        throw new Error('Invalid client credentials. Please check Canva app configuration.');
      } else if (errorData?.error === 'invalid_request') {
        throw new Error('Invalid request format. Please contact support.');
      }
    } else if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please check Canva app credentials.');
    }
    
    throw new Error(`Token exchange failed: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get user information from Canva API
 * @param {string} accessToken - Canva access token
 * @returns {Promise<Object>} User information from Canva
 */
async function getCanvaUserInfo(accessToken) {
  try {
    console.log('[Canva Auth] Fetching user info from Canva');
    
    const response = await axios.get('https://api.canva.com/rest/v1/users/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('[Canva Auth] Raw API response:', JSON.stringify(response.data, null, 2));
    
    // Validate response structure
    if (!response.data || !response.data.team_user) {
      throw new Error('Invalid response structure from Canva API');
    }
    
    const teamUser = response.data.team_user;
    
    // Validate required fields
    if (!teamUser.user_id) {
      throw new Error('Missing user_id in Canva API response');
    }
    
    console.log('[Canva Auth] User info fetched successfully', {
      user_id: teamUser.user_id,
      team_id: teamUser.team_id
    });
    
    // Return normalized user object
    return {
      id: teamUser.user_id,
      user_id: teamUser.user_id,
      team_id: teamUser.team_id,
      display_name: null, // Not available in /users/me endpoint
      email: null // Not available in /users/me endpoint
    };
    
  } catch (error) {
    console.error('[Canva Auth] Failed to fetch user info:', error.response?.data || error.message);
    throw new Error(`Failed to fetch user info: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Save Canva user info to user profile (tokens are handled by CanvaTokenManager)
 * @param {string} userId - User ID
 * @param {Object} userInfo - User info from Canva
 */
async function saveCanvaUserInfoToProfile(userId, userInfo) {
  try {
    console.log(`[Canva Auth] Saving user info for user: ${userId}`, {
      canva_user_id: userInfo.canva_user_id,
      canva_team_id: userInfo.canva_team_id,
      hasDisplayName: !!userInfo.canva_display_name,
      hasEmail: !!userInfo.canva_email
    });
    
    // Prepare update data, only including non-null values
    const updateData = {
      canva_user_id: userInfo.canva_user_id
    };
    
    // Add optional fields if they exist
    if (userInfo.canva_team_id) {
      updateData.canva_team_id = userInfo.canva_team_id;
    }
    if (userInfo.canva_display_name) {
      updateData.canva_display_name = userInfo.canva_display_name;
    }
    if (userInfo.canva_email) {
      updateData.canva_email = userInfo.canva_email;
    }
    
    const { error } = await supabaseService
      .from('profiles')
      .update(updateData)
      .eq('id', userId);
    
    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
    
    console.log(`[Canva Auth] User info saved successfully for user: ${userId}`);
    
  } catch (error) {
    console.error('[Canva Auth] Error saving user info:', error);
    throw error;
  }
}

export default router;