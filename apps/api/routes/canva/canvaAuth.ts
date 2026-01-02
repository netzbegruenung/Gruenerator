/**
 * Canva Authentication Routes
 *
 * Handles OAuth 2.0 PKCE flow for Canva integration,
 * including authorization, callbacks, and token management.
 */

import express, { Request, Response, Router, NextFunction } from 'express';
import crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import passport from '../../config/passportSetup.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { getProfileService } from '../../services/user/ProfileService.js';
import { createLogger } from '../../utils/logger.js';
import { CanvaTokenManager } from '../../utils/integrations/canva/index.js';
import { redisOAuthStateManager } from '../../utils/redis/index.js';
import type { CanvaTokenData, CanvaProfile } from '../../utils/integrations/canva/types.js';
import type { OAuthStateData } from '../../utils/redis/types.js';

const log = createLogger('canvaAuth');

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

// ============================================================================
// Type Definitions
// ============================================================================

interface AuthorizeResponse {
  success: boolean;
  authUrl?: string;
  state?: string;
  scopes?: string[];
  error?: string;
  details?: string;
}

interface CanvaUserInfo {
  id: string;
  user_id: string;
  team_id?: string;
  display_name: string | null;
  email: string | null;
}

interface CanvaUserProfileUpdate {
  canva_user_id: string;
  canva_team_id?: string;
  canva_display_name?: string;
  canva_email?: string;
}

interface CanvaDisconnectUpdate {
  canva_access_token: null;
  canva_refresh_token: null;
  canva_token_expires_at: null;
  canva_user_id: null;
  canva_display_name: null;
  canva_email: null;
  canva_scopes: null;
}

interface StatusResponse {
  success: boolean;
  connected?: boolean;
  expired?: boolean;
  canva_user?: {
    id: string | null;
    display_name: string | null;
    email: string | null;
  } | null;
  scopes?: string[];
  expires_at?: string | null;
  error?: string;
  details?: string;
}

interface DisconnectResponse {
  success: boolean;
  message?: string;
  error?: string;
  details?: string;
}

interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

interface CanvaOAuthData extends OAuthStateData {
  codeVerifier: string;
  sessionId?: string;
}

// Extended session type for Canva OAuth fallback
interface CanvaSession {
  canva_code_verifier?: string;
  canva_state?: string;
  canva_user_id?: string;
  save: (callback: (err?: Error) => void) => void;
}

// Request with user and session for Canva auth
interface CanvaAuthRequest {
  user?: {
    id: string;
    [key: string]: unknown;
  };
  session: CanvaSession;
  sessionID: string;
  method: string;
  originalUrl: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
}

// ============================================================================
// Module Initialization
// ============================================================================

// Validate configuration on module load
if (!CanvaTokenManager.validateConfiguration()) {
  log.error('[Canva Auth] Invalid Canva configuration - routes may not work correctly');
}

// Check Redis availability
redisOAuthStateManager.getStats().then(stats => {
  log.debug('[Canva Auth] Redis OAuth state manager status:', stats);
}).catch(err => {
  log.warn('[Canva Auth] Could not get Redis OAuth stats:', err.message);
});

// ============================================================================
// Middleware
// ============================================================================

router.use(passport.session());

router.use((req: Request, _res: Response, next: NextFunction) => {
  const authReq = req as unknown as CanvaAuthRequest;
  log.debug(`[Canva Auth] ${req.method} ${req.originalUrl} - Session ID: ${authReq.sessionID} - User: ${authReq.user?.id}`);
  next();
});

router.use('/authorize', (req: Request, res: Response, next: NextFunction) => {
  if (!CanvaTokenManager.validateConfiguration()) {
    return res.status(500).json({
      success: false,
      error: 'Canva integration not properly configured'
    });
  }
  next();
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Exchange authorization code for access tokens
 */
async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<CanvaTokenData> {
  log.debug('[Canva Auth] Exchanging authorization code for tokens');

  const credentials = Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString('base64');

  const formData = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.CANVA_CLIENT_ID!,
    code,
    code_verifier: codeVerifier,
    redirect_uri: process.env.CANVA_REDIRECT_URI!
  });

  try {
    const response = await axios.post<CanvaTokenData>('https://api.canva.com/rest/v1/oauth/token', formData, {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    log.debug('[Canva Auth] Token exchange successful');
    return response.data;

  } catch (error) {
    const axiosError = error as AxiosError<{ error?: string; message?: string }>;
    log.error('[Canva Auth] Token exchange failed:', axiosError.response?.data || axiosError.message);

    if (axiosError.response?.status === 400) {
      const errorData = axiosError.response.data;
      if (errorData?.error === 'invalid_grant') {
        throw new Error('Authorization code expired or invalid. Please try again.');
      } else if (errorData?.error === 'invalid_client') {
        throw new Error('Invalid client credentials. Please check Canva app configuration.');
      } else if (errorData?.error === 'invalid_request') {
        throw new Error('Invalid request format. Please contact support.');
      }
    } else if (axiosError.response?.status === 401) {
      throw new Error('Authentication failed. Please check Canva app credentials.');
    }

    throw new Error(`Token exchange failed: ${axiosError.response?.data?.message || axiosError.message}`);
  }
}

/**
 * Get user information from Canva API
 */
async function getCanvaUserInfo(accessToken: string): Promise<CanvaUserInfo> {
  log.debug('[Canva Auth] Fetching user info from Canva');

  try {
    const response = await axios.get<{ team_user: { user_id: string; team_id?: string } }>('https://api.canva.com/rest/v1/users/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    log.debug('[Canva Auth] Raw API response:', JSON.stringify(response.data, null, 2));

    if (!response.data || !response.data.team_user) {
      throw new Error('Invalid response structure from Canva API');
    }

    const teamUser = response.data.team_user;

    if (!teamUser.user_id) {
      throw new Error('Missing user_id in Canva API response');
    }

    log.debug('[Canva Auth] User info fetched successfully', {
      user_id: teamUser.user_id,
      team_id: teamUser.team_id
    });

    return {
      id: teamUser.user_id,
      user_id: teamUser.user_id,
      team_id: teamUser.team_id,
      display_name: null,
      email: null
    };

  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    log.error('[Canva Auth] Failed to fetch user info:', axiosError.response?.data || axiosError.message);
    throw new Error(`Failed to fetch user info: ${axiosError.response?.data?.message || axiosError.message}`);
  }
}

/**
 * Save Canva user info to user profile (tokens are handled by CanvaTokenManager)
 */
async function saveCanvaUserInfoToProfile(userId: string, userInfo: CanvaUserProfileUpdate): Promise<void> {
  log.debug(`[Canva Auth] Saving user info for user: ${userId}`, {
    canva_user_id: userInfo.canva_user_id,
    canva_team_id: userInfo.canva_team_id,
    hasDisplayName: !!userInfo.canva_display_name,
    hasEmail: !!userInfo.canva_email
  });

  const updateData: Partial<CanvaUserProfileUpdate> = {
    canva_user_id: userInfo.canva_user_id
  };

  if (userInfo.canva_team_id) {
    updateData.canva_team_id = userInfo.canva_team_id;
  }
  if (userInfo.canva_display_name) {
    updateData.canva_display_name = userInfo.canva_display_name;
  }
  if (userInfo.canva_email) {
    updateData.canva_email = userInfo.canva_email;
  }

  try {
    const profileService = getProfileService();
    await profileService.updateProfile(userId, updateData);

    log.debug(`[Canva Auth] User info saved successfully for user: ${userId}`);
  } catch (error) {
    log.error('[Canva Auth] Error saving user info:', error);
    throw error;
  }
}

// ============================================================================
// Routes
// ============================================================================

/**
 * Initiate Canva OAuth authorization with PKCE
 * GET /api/canva/auth/authorize
 */
router.get('/authorize', ensureAuthenticated, (req: Request, res: Response<AuthorizeResponse>) => {
  const authReq = req as unknown as CanvaAuthRequest;

  try {
    log.debug(`[Canva Auth] Authorization request by user: ${authReq.user?.id}`, {
      sessionId: authReq.sessionID,
      userAgent: req.headers['user-agent'],
      origin: req.headers.origin
    });

    const codeVerifier = crypto.randomBytes(96).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const state = crypto.randomBytes(96).toString('base64url');

    const oauthData: CanvaOAuthData = {
      userId: authReq.user!.id,
      codeVerifier: codeVerifier,
      sessionId: authReq.sessionID
    };

    log.debug('[Canva Auth] Generated PKCE values and state', {
      sessionId: authReq.sessionID,
      userId: authReq.user!.id,
      stateLength: state.length,
      codeVerifierLength: codeVerifier.length,
      redirectUri: process.env.CANVA_REDIRECT_URI
    });

    const scopes = [
      'asset:read',
      'asset:write',
      'design:meta:read',
      'design:content:read',
      'design:content:write',
      'folder:read'
    ].join(' ');

    const authUrl = new URL('https://www.canva.com/api/oauth/authorize');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', process.env.CANVA_CLIENT_ID!);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('redirect_uri', process.env.CANVA_REDIRECT_URI!);

    log.debug('[Canva Auth] Authorization URL generated for scopes:', scopes);

    const storeOAuthState = async (): Promise<boolean> => {
      try {
        const redisSuccess = await redisOAuthStateManager.storeState(state, oauthData);

        if (redisSuccess) {
          log.debug('[Canva Auth] OAuth state stored in Redis successfully');
          return true;
        } else {
          log.warn('[Canva Auth] Redis unavailable, falling back to session storage');
          authReq.session.canva_code_verifier = codeVerifier;
          authReq.session.canva_state = state;
          authReq.session.canva_user_id = authReq.user!.id;

          return new Promise((resolve, reject) => {
            authReq.session.save((err?: Error) => {
              if (err) {
                log.error('[Canva Auth] Error saving session fallback:', err);
                reject(err);
              } else {
                log.debug('[Canva Auth] Session fallback saved successfully');
                resolve(true);
              }
            });
          });
        }
      } catch (error) {
        log.error('[Canva Auth] Error storing OAuth state:', error);
        throw error;
      }
    };

    storeOAuthState()
      .then(() => {
        res.json({
          success: true,
          authUrl: authUrl.toString(),
          state,
          scopes: scopes.split(' ')
        });
      })
      .catch((error: Error) => {
        log.error('[Canva Auth] Failed to store OAuth state:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to store OAuth state'
        });
      });

  } catch (error) {
    log.error('[Canva Auth] Error in authorization:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate authorization URL',
      details: (error as Error).message
    });
  }
});

/**
 * Handle Canva OAuth callback
 * GET /api/canva/auth/callback
 * Note: No authentication required - OAuth callbacks arrive in different session context
 */
router.get('/callback', async (req: Request, res: Response) => {
  const authReq = req as unknown as CanvaAuthRequest;

  try {
    const { code, state, error: oauthError } = req.query as CallbackQuery;

    log.debug(`[Canva Auth] Callback received`, {
      sessionId: authReq.sessionID,
      hasCode: !!code,
      hasState: !!state,
      hasError: !!oauthError,
      statePreview: state ? state.substring(0, 20) + '...' : 'none'
    });

    if (!code || !state) {
      log.error('[Canva Auth] Missing code or state in callback');
      return res.redirect(`${process.env.BASE_URL}/profile/inhalte/canva?canva_error=missing_parameters`);
    }

    let oauthData: CanvaOAuthData | null = null;
    let userId: string | null = null;
    let codeVerifier: string | null = null;

    try {
      oauthData = await redisOAuthStateManager.retrieveState(state) as CanvaOAuthData | null;

      if (oauthData) {
        log.debug('[Canva Auth] OAuth state retrieved from Redis');
        userId = oauthData.userId;
        codeVerifier = oauthData.codeVerifier;
      } else {
        log.warn('[Canva Auth] OAuth state not found in Redis, checking session fallback');

        const sessionState = authReq.session?.canva_state;
        if (sessionState === state) {
          log.debug('[Canva Auth] OAuth state found in session fallback');
          userId = authReq.session.canva_user_id || null;
          codeVerifier = authReq.session.canva_code_verifier || null;

          delete authReq.session.canva_code_verifier;
          delete authReq.session.canva_state;
          delete authReq.session.canva_user_id;
        }
      }

    } catch (error) {
      log.error('[Canva Auth] Error retrieving OAuth state:', error);
    }

    if (!userId || !codeVerifier) {
      log.error('[Canva Auth] OAuth state not found or incomplete', {
        hasUserId: !!userId,
        hasCodeVerifier: !!codeVerifier,
        redisAvailable: redisOAuthStateManager.isAvailable()
      });
      return res.redirect(`${process.env.BASE_URL}/profile/inhalte/canva?canva_error=session_lost`);
    }

    if (oauthError) {
      log.error('[Canva Auth] OAuth error in callback:', oauthError);
      return res.redirect(`${process.env.BASE_URL}/profile/inhalte/canva?canva_error=${encodeURIComponent(oauthError)}`);
    }

    log.debug('[Canva Auth] State verified, exchanging code for tokens');

    const tokenResponse = await exchangeCodeForTokens(code, codeVerifier);

    if (!tokenResponse.access_token) {
      throw new Error('No access token received from Canva');
    }

    log.debug('[Canva Auth] Successfully received tokens from Canva');

    const canvaUser = await getCanvaUserInfo(tokenResponse.access_token);

    await CanvaTokenManager.saveTokens(userId, tokenResponse);

    await saveCanvaUserInfoToProfile(userId, {
      canva_user_id: canvaUser.id,
      canva_team_id: canvaUser.team_id,
      canva_display_name: canvaUser.display_name || undefined,
      canva_email: canvaUser.email || undefined
    });

    log.debug(`[Canva Auth] Successfully connected Canva account for user: ${userId}`);

    res.redirect(`${process.env.BASE_URL}/profile/inhalte/canva?canva_connected=true`);

  } catch (error) {
    log.error('[Canva Auth] Error in callback:', {
      error: (error as Error).message,
      sessionId: authReq.sessionID,
      redisAvailable: redisOAuthStateManager.isAvailable()
    });

    res.redirect(`${process.env.BASE_URL}/profile/inhalte/canva?canva_error=${encodeURIComponent((error as Error).message)}`);
  }
});

/**
 * Get current Canva connection status
 * GET /api/canva/auth/status
 */
router.get('/status', ensureAuthenticated, async (req: Request, res: Response<StatusResponse>) => {
  const authReq = req as unknown as CanvaAuthRequest;

  try {
    log.debug(`[Canva Auth] Status check for user: ${authReq.user?.id}`);

    const profileService = getProfileService();
    const profile = await profileService.getProfileById(authReq.user!.id) as unknown as CanvaProfile | null;

    if (!profile) {
      throw new Error('User profile not found');
    }

    const hasConnection = !!(profile.canva_access_token && profile.canva_user_id);
    const isExpired = profile.canva_token_expires_at
      ? new Date(profile.canva_token_expires_at) <= new Date()
      : true;

    log.debug(`[Canva Auth] User ${authReq.user!.id} connection status:`, {
      hasConnection,
      isExpired,
      canvaUserId: profile.canva_user_id
    });

    res.json({
      success: true,
      connected: hasConnection,
      expired: isExpired,
      canva_user: hasConnection ? {
        id: profile.canva_user_id || null,
        display_name: profile.canva_display_name || null,
        email: profile.canva_email || null
      } : null,
      scopes: profile.canva_scopes || [],
      expires_at: profile.canva_token_expires_at
    });

  } catch (error) {
    log.error('[Canva Auth] Error checking status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check Canva connection status',
      details: (error as Error).message
    });
  }
});

/**
 * Disconnect Canva account
 * POST /api/canva/auth/disconnect
 */
router.post('/disconnect', ensureAuthenticated, async (req: Request, res: Response<DisconnectResponse>) => {
  const authReq = req as unknown as CanvaAuthRequest;

  try {
    log.debug(`[Canva Auth] Disconnect request for user: ${authReq.user?.id}`);

    const profileService = getProfileService();
    const updateData: CanvaDisconnectUpdate = {
      canva_access_token: null,
      canva_refresh_token: null,
      canva_token_expires_at: null,
      canva_user_id: null,
      canva_display_name: null,
      canva_email: null,
      canva_scopes: null
    };

    await profileService.updateProfile(authReq.user!.id, updateData);

    log.debug(`[Canva Auth] Successfully disconnected Canva account for user: ${authReq.user!.id}`);

    res.json({
      success: true,
      message: 'Canva account disconnected successfully'
    });

  } catch (error) {
    log.error('[Canva Auth] Error disconnecting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect Canva account',
      details: (error as Error).message
    });
  }
});

export default router;
