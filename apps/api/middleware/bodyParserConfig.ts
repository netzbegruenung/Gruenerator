/**
 * Body Parser Configuration
 * Skip logic for TUS uploads and other streaming endpoints
 * Extracted from server.mjs for better modularity
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';

export const TUS_UPLOAD_PATHS = [
  '/api/subtitler/upload',
  '/api/audio/upload',
  '/api/uploads',
  '/api/admin/parteitage/upload',
];

// `/api/browser-agent/llm`: jeder Schritt trägt einen base64-Screenshot, der
// Verlauf mehrere — eigener 20-MB-Parser im Router statt des globalen 10 MB.
// `/api/admin/parteitage/import`: das Manifest trägt alle Wortzeiten (~230k Werte), mehr als
// der Wertedeckel des globalen Parsers — eigener Parser hinter dem Admin-Gate in routes.ts.
const CUSTOM_BODY_PARSER_PATHS = [
  '/api/chat-graph/stream',
  '/api/browser-agent/llm',
  '/api/admin/parteitage/import',
];

export interface BodyParserSkipConfig {
  skipPaths: string[];
}

const defaultSkipConfig: BodyParserSkipConfig = {
  skipPaths: TUS_UPLOAD_PATHS,
};

/**
 * Check if body parsing should be skipped for a request
 * Used for TUS uploads, streaming endpoints, and routes with custom body size limits
 */
export function shouldSkipBodyParser(
  req: Request,
  config: BodyParserSkipConfig = defaultSkipConfig
): boolean {
  return (
    config.skipPaths.some((path) => req.path.startsWith(path)) ||
    CUSTOM_BODY_PARSER_PATHS.some((path) => req.path.startsWith(path))
  );
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
