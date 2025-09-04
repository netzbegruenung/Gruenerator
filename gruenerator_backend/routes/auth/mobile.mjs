import express from 'express';
import jwtAuthMiddleware from '../../middleware/jwtAuthMiddleware.js';
import { SignJWT } from 'jose';
import { getProfileService } from '../../services/ProfileService.mjs';

const router = express.Router();

// JWT Exchange endpoint - converts Keycloak token to simple JWT
router.post('/exchange', async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'Keycloak token required' });
  }

  try {
    console.log('[Mobile Exchange] Validating Keycloak token');
    
    // Validate Keycloak token directly without audience validation
    const { jwtVerify, createRemoteJWKSet } = await import('jose');
    const JWKS = createRemoteJWKSet(new URL(
      `${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/certs`
    ));
    
    const { payload: keycloakPayload } = await jwtVerify(token, JWKS, {
      issuer: `${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}`
      // Skip audience validation - accept any client from this realm
    });
    
    console.log('[Mobile Exchange] Keycloak token validated for user:', keycloakPayload.sub);
    
    // Get user from database using keycloak_id
    const profileService = getProfileService();
    const user = await profileService.getProfileByKeycloakId(keycloakPayload.sub);
    
    if (!user) {
      console.error('[Mobile Exchange] User not found for keycloak_id:', keycloakPayload.sub);
      return res.status(401).json({ error: 'User not found' });
    }
    
    console.log('[Mobile Exchange] User found:', user.id);
    
    // Create simple JWT with 30-day expiry
    const secret = new TextEncoder().encode(
      process.env.SESSION_SECRET || 'fallback-secret-please-change'
    );
    
    const jwt = await new SignJWT({
      sub: user.id,
      keycloak_id: user.keycloak_id,
      email: user.email,
      username: user.username,
      mobile: true
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .setIssuer('gruenerator-mobile')
      .setAudience('gruenerator-app')
      .sign(secret);
    
    console.log('[Mobile Exchange] JWT created for user:', user.id);
    
    // Return JWT and user data
    res.json({
      success: true,
      token: jwt,
      user: user,
      expiresIn: 30 * 24 * 60 * 60, // 30 days in seconds
      tokenType: 'Bearer'
    });
    
  } catch (error) {
    console.error('[Mobile Exchange] Error:', error);
    
    // More specific error messages
    if (error.message.includes('Token validation failed')) {
      return res.status(401).json({ error: 'Invalid Keycloak token' });
    }
    
    res.status(500).json({ error: 'Token exchange failed' });
  }
});

// Mobile auth status endpoint
router.get('/status', jwtAuthMiddleware, async (req, res) => {
  if (!req.mobileAuth) {
    return res.json({
      isAuthenticated: false,
      user: null,
      authMethod: 'none'
    });
  }

  try {
    res.json({
      isAuthenticated: true,
      user: req.user,
      authMethod: 'jwt',
      tokenInfo: {
        issuer: req.jwtToken.iss,
        audience: req.jwtToken.aud,
        expiresAt: req.jwtToken.exp
      }
    });
  } catch (error) {
    console.error('[Mobile Auth Status] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Token refresh endpoint
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  
  if (!refresh_token) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  try {
    // Use Keycloak token endpoint to refresh
    const tokenResponse = await fetch(`${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh_token,
        client_id: process.env.MOBILE_CLIENT_ID,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Token refresh failed');
    }

    const tokens = await tokenResponse.json();
    
    res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type
    });
  } catch (error) {
    console.error('[Mobile Auth Refresh] Error:', error);
    res.status(401).json({ error: 'Token refresh failed' });
  }
});

// Mobile logout endpoint
router.post('/logout', jwtAuthMiddleware, async (req, res) => {
  if (!req.mobileAuth) {
    return res.json({ success: true, message: 'No active session' });
  }

  try {
    const { refresh_token } = req.body;
    
    if (refresh_token) {
      // Revoke refresh token at Keycloak
      await fetch(`${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: process.env.MOBILE_CLIENT_ID,
          refresh_token: refresh_token,
        }),
      });
    }

    res.json({
      success: true,
      message: 'Mobile logout successful',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('[Mobile Auth Logout] Error:', error);
    res.json({
      success: true,
      message: 'Logout completed (with errors)',
      timestamp: Date.now()
    });
  }
});

export default router;
