/**
 * Factory functions for creating Express routers with authentication middleware
 */

import * as express from 'express';

import passport from '../../config/passportSetup.js';
import jwtAuthMiddleware from '../../middleware/jwtAuthMiddleware.js';

import type { Router, RequestHandler } from 'express';

/**
 * Factory function to create an Express router with authentication middleware
 * Tries JWT bearer auth first (mobile/desktop), falls back to session auth (web)
 * @returns Express router with dual authentication
 */
export function createAuthenticatedRouter(): Router {
  const router = express.Router();

  router.use(jwtAuthMiddleware);
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
