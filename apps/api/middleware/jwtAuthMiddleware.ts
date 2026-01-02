/**
 * JWT Authentication Middleware
 *
 * NOTE: Mobile auth is currently disabled. This is a passthrough middleware.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Passthrough middleware when mobile auth is disabled
 */
async function jwtAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  return next();
}

export default jwtAuthMiddleware;
