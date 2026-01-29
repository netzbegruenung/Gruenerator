/**
 * Mobile/Desktop App Authentication Routes
 *
 * Handles JWT-based authentication for native apps (iOS, Android, Tauri desktop).
 * Uses system browser + deep-link callback for OAuth, then exchanges for JWT tokens.
 *
 * Endpoints:
 * - POST /auth/mobile/consume-login-code - Exchange OAuth code for tokens
 * - POST /auth/mobile/refresh - Refresh access token
 * - GET /auth/mobile/status - Validate token and get user profile
 * - POST /auth/mobile/logout - Revoke refresh token
 */

import { createHash, randomBytes } from 'crypto';

import express, { type Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';

import { createLogger } from '../../utils/logger.js';

import type { AuthRequest } from './types.js';
import type { UserProfile } from '../../services/user/types.js';

const log = createLogger('mobileAuth');
const router = express.Router();

const JWT_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'fallback-secret-please-change'
);
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

interface ConsumeLoginCodeBody {
  code: string;
}

interface RefreshTokenBody {
  refresh_token: string;
}

interface TokenResponse {
  success: boolean;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  user?: Partial<UserProfile>;
  error?: string;
}

/**
 * Hash a refresh token for secure storage
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a secure random refresh token
 */
function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Create an access token JWT
 */
async function createAccessToken(user: UserProfile): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    keycloak_id: user.keycloak_id || null,
    token_use: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .setIssuer('gruenerator-api')
    .setAudience('gruenerator-app')
    .sign(JWT_SECRET);
}

/**
 * Sanitize user profile for client response (remove sensitive fields)
 */
function sanitizeUserForResponse(user: UserProfile): Partial<UserProfile> {
  const {
    id,
    email,
    username,
    display_name,
    avatar_robot_id,
    keycloak_id,
    igel_modus,
    locale,
    beta_features,
    user_defaults,
    groups_enabled,
    custom_generators,
    database_access,
    collab,
    notebook,
    sharepic,
    anweisungen,
    canva,
    labor_enabled,
    sites_enabled,
    chat,
    interactive_antrag_enabled,
    vorlagen,
    video_editor,
    scanner,
    prompts,
  } = user;

  return {
    id,
    email,
    username,
    display_name,
    avatar_robot_id,
    keycloak_id,
    igel_modus,
    locale,
    beta_features,
    user_defaults,
    groups_enabled,
    custom_generators,
    database_access,
    collab,
    notebook,
    sharepic,
    anweisungen,
    canva,
    labor_enabled,
    sites_enabled,
    chat,
    interactive_antrag_enabled,
    vorlagen,
    video_editor,
    scanner,
    prompts,
  };
}

/**
 * POST /auth/mobile/consume-login-code
 *
 * Exchange the short-lived login code (from OAuth callback) for access + refresh tokens.
 * The code is a JWT signed during the OAuth callback with token_use: 'app_login_code'.
 */
router.post(
  '/mobile/consume-login-code',
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { code } = req.body as ConsumeLoginCodeBody;

      if (!code) {
        res.status(400).json({
          success: false,
          error: 'missing_code',
          message: 'Login code is required',
        } as TokenResponse);
        return;
      }

      // Verify the login code JWT
      let payload;
      try {
        const result = await jwtVerify(code, JWT_SECRET, {
          issuer: 'gruenerator-auth',
          audience: 'gruenerator-app-login-code',
        });
        payload = result.payload;
      } catch (jwtError) {
        log.warn('[MobileAuth] Invalid or expired login code', {
          error: (jwtError as Error).message,
        });
        res.status(401).json({
          success: false,
          error: 'invalid_code',
          message: 'Login code is invalid or expired',
        } as TokenResponse);
        return;
      }

      // Validate the token payload
      if (payload.token_use !== 'app_login_code' || !payload.sub) {
        log.warn('[MobileAuth] Invalid token payload', { payload });
        res.status(401).json({
          success: false,
          error: 'invalid_token_type',
          message: 'Invalid token type',
        } as TokenResponse);
        return;
      }

      const userId = payload.sub as string;

      // Load user from database
      const { getProfileService } = await import('../../services/user/ProfileService.js');
      const profileService = getProfileService();
      const user = await profileService.getProfileById(userId);

      if (!user) {
        log.error('[MobileAuth] User not found for login code', { userId });
        res.status(404).json({
          success: false,
          error: 'user_not_found',
          message: 'User account not found',
        } as TokenResponse);
        return;
      }

      // Generate tokens
      const accessToken = await createAccessToken(user);
      const refreshToken = generateRefreshToken();
      const refreshTokenHash = hashToken(refreshToken);

      // Store refresh token in database
      const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
      const db = getPostgresInstance();

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

      const userAgent = req.headers['user-agent'] || 'unknown';
      const deviceType = userAgent.toLowerCase().includes('tauri')
        ? 'desktop'
        : userAgent.toLowerCase().includes('android')
          ? 'android'
          : userAgent.toLowerCase().includes('iphone')
            ? 'ios'
            : 'unknown';

      await db.query(
        `INSERT INTO app_refresh_tokens (user_id, token_hash, device_name, device_type, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, refreshTokenHash, userAgent.substring(0, 255), deviceType, expiresAt]
      );

      log.info('[MobileAuth] Login code consumed successfully', {
        userId,
        deviceType,
        expiresAt: expiresAt.toISOString(),
      });

      res.json({
        success: true,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: 900, // 15 minutes in seconds
        user: sanitizeUserForResponse(user),
      } as TokenResponse);
    } catch (error) {
      log.error('[MobileAuth] Error consuming login code:', error);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: 'Failed to process login',
      } as TokenResponse);
    }
  }
);

/**
 * POST /auth/mobile/refresh
 *
 * Refresh the access token using a valid refresh token.
 */
router.post('/mobile/refresh', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { refresh_token } = req.body as RefreshTokenBody;

    if (!refresh_token) {
      res.status(400).json({
        success: false,
        error: 'missing_refresh_token',
        message: 'Refresh token is required',
      } as TokenResponse);
      return;
    }

    const tokenHash = hashToken(refresh_token);

    // Look up refresh token in database
    const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
    const db = getPostgresInstance();

    const result = await db.query(
      `SELECT user_id, expires_at, revoked_at
       FROM app_refresh_tokens
       WHERE token_hash = $1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      log.warn('[MobileAuth] Refresh token not found');
      res.status(401).json({
        success: false,
        error: 'invalid_refresh_token',
        message: 'Invalid refresh token',
      } as TokenResponse);
      return;
    }

    const tokenRecord = result.rows[0];

    // Check if token is revoked
    if (tokenRecord.revoked_at) {
      log.warn('[MobileAuth] Attempted to use revoked refresh token', {
        userId: tokenRecord.user_id,
      });
      res.status(401).json({
        success: false,
        error: 'token_revoked',
        message: 'Refresh token has been revoked',
      } as TokenResponse);
      return;
    }

    // Check if token is expired
    if (new Date(tokenRecord.expires_at) < new Date()) {
      log.warn('[MobileAuth] Attempted to use expired refresh token', {
        userId: tokenRecord.user_id,
      });
      res.status(401).json({
        success: false,
        error: 'token_expired',
        message: 'Refresh token has expired',
      } as TokenResponse);
      return;
    }

    // Load user
    const { getProfileService } = await import('../../services/user/ProfileService.js');
    const profileService = getProfileService();
    const user = await profileService.getProfileById(tokenRecord.user_id);

    if (!user) {
      log.error('[MobileAuth] User not found for refresh token', {
        userId: tokenRecord.user_id,
      });
      res.status(404).json({
        success: false,
        error: 'user_not_found',
        message: 'User account not found',
      } as TokenResponse);
      return;
    }

    // Update last_used_at
    await db.query(`UPDATE app_refresh_tokens SET last_used_at = NOW() WHERE token_hash = $1`, [
      tokenHash,
    ]);

    // Generate new access token
    const accessToken = await createAccessToken(user);

    log.debug('[MobileAuth] Access token refreshed', { userId: user.id });

    res.json({
      success: true,
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      user: sanitizeUserForResponse(user),
    } as TokenResponse);
  } catch (error) {
    log.error('[MobileAuth] Error refreshing token:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Failed to refresh token',
    } as TokenResponse);
  }
});

/**
 * GET /auth/mobile/status
 *
 * Validate the access token and return user profile.
 * Requires Authorization: Bearer <token> header.
 */
router.get('/mobile/status', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'missing_token',
        message: 'Authorization header with Bearer token required',
      });
      return;
    }

    const token = authHeader.substring(7);

    // Verify the access token
    let payload;
    try {
      const result = await jwtVerify(token, JWT_SECRET, {
        issuer: 'gruenerator-api',
        audience: 'gruenerator-app',
      });
      payload = result.payload;
    } catch (jwtError) {
      log.debug('[MobileAuth] Invalid access token', {
        error: (jwtError as Error).message,
      });
      res.status(401).json({
        success: false,
        error: 'invalid_token',
        message: 'Access token is invalid or expired',
      });
      return;
    }

    if (payload.token_use !== 'access' || !payload.sub) {
      res.status(401).json({
        success: false,
        error: 'invalid_token_type',
        message: 'Invalid token type',
      });
      return;
    }

    const userId = payload.sub as string;

    // Load user
    const { getProfileService } = await import('../../services/user/ProfileService.js');
    const profileService = getProfileService();
    const user = await profileService.getProfileById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'user_not_found',
        message: 'User account not found',
      });
      return;
    }

    res.json({
      success: true,
      isAuthenticated: true,
      user: sanitizeUserForResponse(user),
    });
  } catch (error) {
    log.error('[MobileAuth] Error checking status:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Failed to check authentication status',
    });
  }
});

/**
 * POST /auth/mobile/logout
 *
 * Revoke the refresh token.
 */
router.post('/mobile/logout', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { refresh_token } = req.body as RefreshTokenBody;

    if (!refresh_token) {
      // Even without a token, consider logout successful
      res.json({
        success: true,
        message: 'Logged out',
      });
      return;
    }

    const tokenHash = hashToken(refresh_token);

    // Revoke the refresh token
    const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
    const db = getPostgresInstance();

    const result = await db.query(
      `UPDATE app_refresh_tokens
       SET revoked_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL
       RETURNING user_id`,
      [tokenHash]
    );

    if (result.rows.length > 0) {
      log.info('[MobileAuth] Refresh token revoked', { userId: result.rows[0].user_id });
    }

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    log.error('[MobileAuth] Error during logout:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Failed to logout',
    });
  }
});

/**
 * DELETE /auth/mobile/sessions
 *
 * Revoke all refresh tokens for the authenticated user.
 * Requires Authorization: Bearer <token> header.
 */
router.delete('/mobile/sessions', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'missing_token',
        message: 'Authorization header with Bearer token required',
      });
      return;
    }

    const token = authHeader.substring(7);

    // Verify the access token
    let payload;
    try {
      const result = await jwtVerify(token, JWT_SECRET, {
        issuer: 'gruenerator-api',
        audience: 'gruenerator-app',
      });
      payload = result.payload;
    } catch {
      res.status(401).json({
        success: false,
        error: 'invalid_token',
        message: 'Access token is invalid or expired',
      });
      return;
    }

    if (!payload.sub) {
      res.status(401).json({
        success: false,
        error: 'invalid_token',
        message: 'Invalid token',
      });
      return;
    }

    const userId = payload.sub as string;

    // Revoke all refresh tokens for this user
    const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
    const db = getPostgresInstance();

    const result = await db.query(
      `UPDATE app_refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL
       RETURNING id`,
      [userId]
    );

    log.info('[MobileAuth] All sessions revoked', {
      userId,
      count: result.rows.length,
    });

    res.json({
      success: true,
      message: `Revoked ${result.rows.length} session(s)`,
      revoked_count: result.rows.length,
    });
  } catch (error) {
    log.error('[MobileAuth] Error revoking sessions:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Failed to revoke sessions',
    });
  }
});

export default router;
