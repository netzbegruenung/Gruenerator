const { supabaseService } = require('../utils/supabaseClient');

async function jwtAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // No JWT token, continue to session auth
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  try {
    // Dynamic import for ES module
    const { validateKeycloakToken } = await import('../utils/keycloakJwtValidator.mjs');
    const decoded = await validateKeycloakToken(token);
    
    // Get user profile from database using Keycloak ID
    const { data: user, error } = await supabaseService
      .from('profiles')
      .select('*')
      .eq('keycloak_id', decoded.sub)
      .single();

    if (error || !user) {
      console.error('[JWT Auth] User not found in database:', decoded.sub);
      return res.status(401).json({ error: 'User not found' });
    }

    // Load user's groups if groups beta feature is enabled
    if (user.beta_features?.groups) {
      try {
        const { data: memberships } = await supabaseService
          .from('group_memberships')
          .select(`
            group_id,
            role,
            joined_at,
            groups!inner(id, name, created_at, created_by, join_token)
          `)
          .eq('user_id', user.id);

        if (memberships) {
          user.groups = memberships.map(m => ({
            id: m.groups.id,
            name: m.groups.name,
            created_at: m.groups.created_at,
            created_by: m.groups.created_by,
            join_token: m.groups.join_token,
            role: m.role,
            joined_at: m.joined_at,
            isAdmin: m.groups.created_by === user.id || m.role === 'admin'
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