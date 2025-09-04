// Note: DatabaseAdapter is ESM. Import lazily inside functions where needed.

async function jwtAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // No JWT token, continue to session auth
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  try {
    let decoded;
    let user;
    
    // Try to decode as simple mobile JWT first
    try {
      const { jwtVerify } = await import('jose');
      const secret = new TextEncoder().encode(
        process.env.SESSION_SECRET || 'fallback-secret-please-change'
      );
      
      const { payload } = await jwtVerify(token, secret, {
        issuer: 'gruenerator-mobile',
        audience: 'gruenerator-app'
      });
      
      console.log('[JWT Auth] Simple mobile JWT validated for user:', payload.sub);
      
      // Get user from database using user ID
      const { getProfileService } = await import('../services/ProfileService.mjs');
      const profileService = getProfileService();
      const userData = await profileService.getProfileById(payload.sub);
      
      if (!userData) {
        console.error('[JWT Auth] User not found for ID:', payload.sub);
        return res.status(401).json({ error: 'User not found' });
      }
      
      decoded = payload;
      user = userData;
      
    } catch (simpleJwtError) {
      // If simple JWT validation fails, try Keycloak JWT
      console.log('[JWT Auth] Simple JWT validation failed, trying Keycloak JWT');
      
      const { validateKeycloakToken } = await import('../utils/keycloakJwtValidator.mjs');
      decoded = await validateKeycloakToken(token);
      
      // Get user profile from database using Keycloak ID
      const { getProfileService } = await import('../services/ProfileService.mjs');
      const profileService = getProfileService();
      const userData = await profileService.getProfileByKeycloakId(decoded.sub);

      if (!userData) {
        console.error('[JWT Auth] User not found in database:', decoded.sub);
        return res.status(401).json({ error: 'User not found' });
      }
      
      user = userData;
    }

    // Load user's groups if groups beta feature is enabled
    if (user.beta_features?.groups) {
      try {
        const { getDatabaseAdapter } = await import('../database/services/DatabaseAdapter.js');
        const db = getDatabaseAdapter();
        await db.ensureInitialized();
        
        const memberships = await db.query(`
          SELECT 
            gm.group_id,
            gm.role,
            gm.joined_at,
            g.id,
            g.name,
            g.created_at,
            g.created_by,
            g.join_token
          FROM group_memberships gm
          INNER JOIN groups g ON g.id = gm.group_id
          WHERE gm.user_id = $1 AND gm.is_active = true
        `, [user.id]);

        if (memberships && memberships.data.length > 0) {
          user.groups = memberships.data.map(m => ({
            id: m.id,
            name: m.name,
            created_at: m.created_at,
            created_by: m.created_by,
            join_token: m.join_token,
            role: m.role,
            joined_at: m.joined_at,
            isAdmin: m.created_by === user.id || m.role === 'admin'
          }));
        }
      } catch (groupError) {
        console.warn('[JWT Auth] Error loading groups:', groupError);
      }
    }

    // Attach user to request
    req.user = user;
    req.mobileAuth = true;
    req.jwtToken = decoded;
    
    // Mock isAuthenticated for compatibility
    req.isAuthenticated = () => true;
    
    next();
  } catch (error) {
    console.error('[JWT Auth] Token validation failed:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = jwtAuthMiddleware;
