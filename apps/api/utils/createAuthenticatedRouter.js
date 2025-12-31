import express from 'express';
import passport from '../config/passportSetup.mjs';

/**
 * Factory function to create an Express router with authentication middleware
 * Automatically adds passport.session() middleware for user authentication
 */
export function createAuthenticatedRouter() {
  const router = express.Router();
  
  // Add Passport session middleware for authentication
  router.use(passport.session());
  
  return router;
}

/**
 * Factory function to create an Express router with authentication AND authorization
 * For routes that require specific user permissions
 */
export function createAuthorizedRouter(requireAuthMiddleware = null) {
  const router = createAuthenticatedRouter();
  
  // Add additional authorization middleware if provided
  if (requireAuthMiddleware) {
    router.use(requireAuthMiddleware);
  }
  
  return router;
} 