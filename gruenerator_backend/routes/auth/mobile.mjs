import express from 'express';
import jwtAuthMiddleware from '../../middleware/jwtAuthMiddleware.js';
import { supabaseService } from '../../utils/supabaseClient.js';

const router = express.Router();

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
    // Get fresh auth user data for metadata
    const { data: authUser } = await supabaseService.auth.admin.getUserById(req.user.id);
    
    if (authUser?.user?.user_metadata) {
      req.user.user_metadata = authUser.user.user_metadata;
    }

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