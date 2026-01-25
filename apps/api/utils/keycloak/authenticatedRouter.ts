/**
 * Factory functions for creating Express routers with authentication middleware
 */

import * as express from 'express';
import type { Router, RequestHandler } from 'express';
import passport from '../../config/passportSetup.js';

/**
 * Factory function to create an Express router with authentication middleware
 * Automatically adds passport.session() middleware for user authentication
 * @returns Express router with session authentication
 */
export function createAuthenticatedRouter(): Router {
  const router = express.Router();

  // Add Passport session middleware for authentication
  router.use(passport.session());

  return router;
}

/**
 * Factory function to create an Express router with authentication AND authorization
 * For routes that require specific user permissions
 * @param requireAuthMiddleware - Optional middleware for additional authorization checks
 * @returns Express router with authentication and authorization
 */
export function createAuthorizedRouter(
  requireAuthMiddleware: RequestHandler | null = null
): Router {
  const router = createAuthenticatedRouter();

  // Add additional authorization middleware if provided
  if (requireAuthMiddleware) {
    router.use(requireAuthMiddleware);
  }

  return router;
}
