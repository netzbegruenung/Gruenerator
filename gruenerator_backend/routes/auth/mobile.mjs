import express from 'express';
import jwtAuthMiddleware from '../../middleware/jwtAuthMiddleware.js';
import { SignJWT } from 'jose';
import { getProfileService } from '../../services/ProfileService.mjs';
import { createLogger } from '../../utils/logger.js';
const log = createLogger('mobile');


const router = express.Router();

// MOBILE AUTH DISABLED - One-time login code replay protection (in-memory)
// const usedLoginCodes = new Map(); // jti -> expiresAt(ms)

// function markCodeUsed(jti, ttlMs = 2 * 60 * 1000) {
//   const expires = Date.now() + ttlMs;
//   usedLoginCodes.set(jti, expires);
// }

// function isCodeUsed(jti) {
//   const exp = usedLoginCodes.get(jti);
//   if (!exp) return false;
//   if (Date.now() > exp) {
//     usedLoginCodes.delete(jti);
//     return false;
//   }
//   return true;
// }

// MOBILE AUTH DISABLED - JWT Exchange endpoint - converts Keycloak token to simple JWT
// router.post('/exchange', async (req, res) => {
//   const { token } = req.body;
//
//   if (!token) {
//     return res.status(400).json({ error: 'Keycloak token required' });
//   }

//   try {
//     log.debug('[Mobile Exchange] Validating Keycloak token');
//
//     // Validate Keycloak token directly without audience validation
//     const { jwtVerify, createRemoteJWKSet } = await import('jose');
//     const JWKS = createRemoteJWKSet(new URL(
//       `${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/certs`
//     ));
//
//     const { payload: keycloakPayload } = await jwtVerify(token, JWKS, {
//       issuer: `${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}`
//       // Skip audience validation - accept any client from this realm
//     });
//
//     log.debug('[Mobile Exchange] Keycloak token validated for user:', keycloakPayload.sub);
//
//     // Get user from database using keycloak_id
//     const profileService = getProfileService();
//     const user = await profileService.getProfileByKeycloakId(keycloakPayload.sub);
//
//     if (!user) {
//       log.error('[Mobile Exchange] User not found for keycloak_id:', keycloakPayload.sub);
//       return res.status(401).json({ error: 'User not found' });
//     }
//
//     log.debug('[Mobile Exchange] User found:', user.id);
//
//     // Create simple JWT with configurable expiry (default 30 days)
//     const secret = new TextEncoder().encode(
//       process.env.SESSION_SECRET || 'fallback-secret-please-change'
//     );
//     const ttl = process.env.MOBILE_JWT_TTL || '30d';
//
//     const jwt = await new SignJWT({
//       sub: user.id,
//       keycloak_id: user.keycloak_id,
//       email: user.email,
//       username: user.username,
//       mobile: true
//     })
//       .setProtectedHeader({ alg: 'HS256' })
//       .setIssuedAt()
//       .setExpirationTime(ttl)
//       .setIssuer('gruenerator-mobile')
//       .setAudience('gruenerator-app')
//       .sign(secret);
//
//     log.debug('[Mobile Exchange] JWT created for user:', user.id);
//
//     // Return JWT and user data
//     res.json({
//       success: true,
//       token: jwt,
//       user: user,
//       expiresIn: typeof ttl === 'string' && ttl.endsWith('d')
//         ? parseInt(ttl) * 24 * 60 * 60
//         : undefined,
//       tokenType: 'Bearer'
//     });
//
//   } catch (error) {
//     log.error('[Mobile Exchange] Error:', error);
//
//     // More specific error messages
//     if (error.message.includes('Token validation failed')) {
//       return res.status(401).json({ error: 'Invalid Keycloak token' });
//     }
//
//     res.status(500).json({ error: 'Token exchange failed' });
//   }
// });

// MOBILE AUTH DISABLED - Mobile auth status endpoint
// router.get('/status', jwtAuthMiddleware, async (req, res) => {
//   if (!req.mobileAuth) {
//     return res.json({
//       isAuthenticated: false,
//       user: null,
//       authMethod: 'none'
//     });
//   }

//   try {
//     res.json({
//       isAuthenticated: true,
//       user: req.user,
//       authMethod: 'jwt',
//       tokenInfo: {
//         issuer: req.jwtToken.iss,
//         audience: req.jwtToken.aud,
//         expiresAt: req.jwtToken.exp
//       }
//     });
//   } catch (error) {
//     log.error('[Mobile Auth Status] Error:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });

// MOBILE AUTH DISABLED - Token refresh endpoint
// router.post('/refresh', async (req, res) => {
//   const { refresh_token } = req.body;
//
//   if (!refresh_token) {
//     return res.status(400).json({ error: 'Refresh token required' });
//   }

//   try {
//     // Use Keycloak token endpoint to refresh
//     const tokenResponse = await fetch(`${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/x-www-form-urlencoded',
//       },
//       body: new URLSearchParams({
//         grant_type: 'refresh_token',
//         refresh_token: refresh_token,
//         client_id: process.env.MOBILE_CLIENT_ID,
//       }),
//     });

//     if (!tokenResponse.ok) {
//       throw new Error('Token refresh failed');
//     }

//     const tokens = await tokenResponse.json();
//
//     res.json({
//       access_token: tokens.access_token,
//       refresh_token: tokens.refresh_token,
//       expires_in: tokens.expires_in,
//       token_type: tokens.token_type
//     });
//   } catch (error) {
//     log.error('[Mobile Auth Refresh] Error:', error);
//     res.status(401).json({ error: 'Token refresh failed' });
//   }
// });

// MOBILE AUTH DISABLED - Mobile logout endpoint
// router.post('/logout', jwtAuthMiddleware, async (req, res) => {
//   if (!req.mobileAuth) {
//     return res.json({ success: true, message: 'No active session' });
//   }

//   try {
//     const { refresh_token } = req.body;
//
//     if (refresh_token) {
//       // Revoke refresh token at Keycloak
//       await fetch(`${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/logout`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/x-www-form-urlencoded',
//         },
//         body: new URLSearchParams({
//           client_id: process.env.MOBILE_CLIENT_ID,
//           refresh_token: refresh_token,
//         }),
//       });
//     }

//     res.json({
//       success: true,
//       message: 'Mobile logout successful',
//       timestamp: Date.now()
//     });
//   } catch (error) {
//     log.error('[Mobile Auth Logout] Error:', error);
//     res.json({
//       success: true,
//       message: 'Logout completed (with errors)',
//       timestamp: Date.now()
//     });
//   }
// });

// export is placed at the end of the file

// MOBILE AUTH DISABLED - Consume short-lived login code and mint app JWT
// router.post('/consume-login-code', async (req, res) => {
//   try {
//     const { code } = req.body || {};
//     if (!code) {
//       return res.status(400).json({ error: 'login_code required' });
//     }

//     const { jwtVerify } = await import('jose');
//     const secret = new TextEncoder().encode(
//       process.env.SESSION_SECRET || 'fallback-secret-please-change'
//     );

//     const { payload } = await jwtVerify(code, secret, {
//       issuer: 'gruenerator-auth',
//       audience: 'gruenerator-app-login-code'
//     });

//     if (payload.token_use !== 'app_login_code') {
//       return res.status(400).json({ error: 'Invalid code type' });
//     }

//     if (!payload.sub) {
//       return res.status(400).json({ error: 'Invalid code: missing user' });
//     }

//     if (payload.jti && isCodeUsed(payload.jti)) {
//       return res.status(400).json({ error: 'Code already used' });
//     }

//     // Fetch user by ID
//     const profileService = getProfileService();
//     let user = await profileService.getProfileById(payload.sub);
//     if (!user && payload.keycloak_id) {
//       user = await profileService.getProfileByKeycloakId(payload.keycloak_id);
//     }
//     if (!user) {
//       return res.status(401).json({ error: 'User not found' });
//     }

//     // Mark code as used (short TTL)
//     if (payload.jti) markCodeUsed(payload.jti);

//     // Issue mobile JWT
//     const ttl = process.env.MOBILE_JWT_TTL || '30d';
//     const jwt = await new SignJWT({
//       sub: user.id,
//       keycloak_id: user.keycloak_id,
//       email: user.email,
//       username: user.username,
//       mobile: true
//     })
//       .setProtectedHeader({ alg: 'HS256' })
//       .setIssuedAt()
//       .setExpirationTime(ttl)
//       .setIssuer('gruenerator-mobile')
//       .setAudience('gruenerator-app')
//       .sign(secret);

//     return res.json({
//       success: true,
//       token: jwt,
//       user,
//       expiresIn: typeof ttl === 'string' && ttl.endsWith('d')
//         ? parseInt(ttl) * 24 * 60 * 60
//         : undefined,
//       tokenType: 'Bearer'
//     });
//   } catch (error) {
//     log.error('[Mobile Consume Login Code] Error:', error);
//     if (String(error?.message || '').includes('exp') || String(error?.code || '').includes('ERR_JWT_EXPIRED')) {
//       return res.status(400).json({ error: 'Code expired' });
//     }
//     return res.status(401).json({ error: 'Invalid code' });
//   }
// });

export default router;
