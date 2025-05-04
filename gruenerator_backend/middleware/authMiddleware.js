const { supabaseService } = require('../utils/supabaseClient');

/**
 * Middleware to authenticate requests using Supabase JWT.
 * Verifies the token in the Authorization header and attaches the user object to req.user.
 */
const authMiddleware = async (req, res, next) => {
  // Check if the Supabase service client is available
  if (!supabaseService) {
    console.error('[AuthMiddleware] Supabase service client is not initialized. Cannot authenticate request.');
    // 503 Service Unavailable might be appropriate here, as it's a server config issue
    return res.status(503).json({ error: 'Authentication service unavailable.' }); 
  }

  // 1. Get token from Authorization header
  const authHeader = req.headers.authorization;
  console.log('[AuthMiddleware] Received headers:', JSON.stringify(req.headers)); // Log all headers (be careful in prod)

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('[AuthMiddleware] No Bearer token provided or header malformed.');
    return res.status(401).json({ error: 'Authorization header missing or malformed.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
     console.warn('[AuthMiddleware] Token missing after Bearer split.');
     return res.status(401).json({ error: 'Bearer token is missing.' });
  }
  // Avoid logging the full token in production environments if possible
  console.log(`[AuthMiddleware] Extracted token (first 10 chars): ${token.substring(0, 10)}...`); 

  try {
    // 2. Verify token using Supabase service client
    console.log('[AuthMiddleware] Verifying token with Supabase...'); 
    const { data: { user }, error } = await supabaseService.auth.getUser(token);

    // Log the raw response from Supabase getUser
    console.log('[AuthMiddleware] Supabase auth.getUser response:', { user: user ? { id: user.id, email: user.email, aud: user.aud } : null, error: error ? { message: error.message, status: error.status } : null });

    if (error) {
      console.warn('[AuthMiddleware] Token verification failed:', error.message);
      // Differentiate between expired/invalid token and other errors
      if (error.message === 'invalid JWT' || error.message.includes('expired')) {
         return res.status(401).json({ error: 'Invalid or expired token.' });
      }
      // For other errors (network issues, Supabase down), a 503 might be better
      return res.status(503).json({ error: 'Failed to verify token with authentication service.' });
    }

    if (!user) {
       // This case might occur if the token is valid but the user doesn't exist anymore
       console.warn('[AuthMiddleware] Token valid, but no user found.');
       return res.status(401).json({ error: 'User not found for the provided token.' });
    }

    // 3. Attach user object to the request
    console.log(`[AuthMiddleware] Token verified successfully. Attaching user object to req.user:`, { id: user.id, email: user.email }); 
    req.user = user; 

    // 4. Proceed to the next middleware or route handler
    console.log('[AuthMiddleware] Calling next().');
    next();

  } catch (catchError) {
    // Catch unexpected errors during the process
    console.error('[AuthMiddleware] Unexpected error during token verification:', catchError);
    return res.status(500).json({ error: 'Internal server error during authentication.' });
  }
};

module.exports = authMiddleware; 