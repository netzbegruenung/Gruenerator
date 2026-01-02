/**
 * Body Parser Configuration
 * Skip logic for TUS uploads and other streaming endpoints
 * Extracted from server.mjs for better modularity
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';

export const TUS_UPLOAD_PATHS = ['/api/subtitler/upload'];

export interface BodyParserSkipConfig {
  skipPaths: string[];
}

const defaultSkipConfig: BodyParserSkipConfig = {
  skipPaths: TUS_UPLOAD_PATHS
};

/**
 * Check if body parsing should be skipped for a request
 * Used for TUS uploads and other streaming endpoints that handle their own body parsing
 */
export function shouldSkipBodyParser(
  req: Request,
  config: BodyParserSkipConfig = defaultSkipConfig
): boolean {
  return config.skipPaths.some(path => req.path.startsWith(path));
}

/**
 * Create middleware that conditionally applies a body parser
 * Skips parsing for paths that handle their own body (e.g., TUS uploads)
 */
export function createConditionalBodyParser(
  parser: RequestHandler,
  config: BodyParserSkipConfig = defaultSkipConfig
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (shouldSkipBodyParser(req, config)) {
      return next();
    }
    parser(req, res, next);
  };
}

export { defaultSkipConfig };
export default shouldSkipBodyParser;
