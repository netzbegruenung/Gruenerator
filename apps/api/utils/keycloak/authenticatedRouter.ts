/**
 * Factory functions for creating Express routers with authentication middleware
 */

import * as express from 'express';

import { requireAuth } from '../../middleware/authMiddleware.js';

import type { Router, RequestHandler } from 'express';

/**
 * Factory function to create an Express router with authentication middleware
 * Uses Better Auth session validation (cookie or bearer token)
 */
export function createAuthenticatedRouter(): Router {
  const router = express.Router();
  router.use(requireAuth);
  return router;
}

/**
 * Factory function to create an Express router with authentication AND authorization
 */
export function createAuthorizedRouter(
  requireAuthMiddleware: RequestHandler | null = null
): Router {
  const router = createAuthenticatedRouter();

  if (requireAuthMiddleware) {
    router.use(requireAuthMiddleware);
  }

  return router;
}
