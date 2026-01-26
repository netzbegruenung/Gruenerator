/**
 * CORS Configuration
 * Extracted from server.mjs for better modularity
 */

import type { CorsOptions } from 'cors';
import type { IncomingHttpHeaders } from 'http';

export interface CorsValidatorResult {
  allowed: boolean;
  effectiveOrigin: string | null;
  reason?: string;
}

export interface CorsValidatorContext {
  'x-forwarded-host'?: string;
  'x-forwarded-proto'?: string;
}

/**
 * Validate if an origin is allowed for CORS
 * Handles nginx proxy scenarios where Origin header may be stripped
 */
export function validateCorsOrigin(
  origin: string | undefined,
  headers: IncomingHttpHeaders,
  allowedOrigins: string[]
): CorsValidatorResult {
  let effectiveOrigin = origin || null;

  // Fallback: If nginx strips Origin header, reconstruct from X-Forwarded-Host
  if (!origin) {
    const forwardedHost = headers['x-forwarded-host'] as string | undefined;
    const forwardedProto = (headers['x-forwarded-proto'] as string) || 'https';
    if (forwardedHost) {
      effectiveOrigin = `${forwardedProto}://${forwardedHost}`;
    }
  }

  // No origin - likely same-origin request
  if (!effectiveOrigin) {
    return {
      allowed: true,
      effectiveOrigin: null,
      reason: 'no-origin-same-site',
    };
  }

  // Check against allowed origins
  if (allowedOrigins.includes(effectiveOrigin)) {
    return {
      allowed: true,
      effectiveOrigin,
    };
  }

  return {
    allowed: false,
    effectiveOrigin,
    reason: 'origin-not-allowed',
  };
}

/**
 * Create CORS options object with the origin validator
 */
export function createCorsOptions(allowedOrigins: string[]): CorsOptions {
  return {
    origin: function (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) {
      // Access headers through 'this' context (Express request)
      const req = this as { headers?: IncomingHttpHeaders } | undefined;
      const headers = req?.headers || {};

      const result = validateCorsOrigin(origin, headers, allowedOrigins);

      if (result.allowed) {
        callback(null, true);
      } else {
        console.error(`[CORS] Origin BLOCKED: ${result.effectiveOrigin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Range',
      // TUS specific headers
      'Upload-Length',
      'Upload-Offset',
      'Tus-Resumable',
      'Upload-Metadata',
      'Upload-Defer-Length',
      'Upload-Concat',
    ],
    exposedHeaders: [
      'Content-Range',
      'Accept-Ranges',
      'Content-Length',
      'Content-Type',
      // TUS specific headers
      'Upload-Offset',
      'Location',
      'Tus-Resumable',
    ],
    credentials: true,
    optionsSuccessStatus: 204,
  };
}

export default createCorsOptions;
