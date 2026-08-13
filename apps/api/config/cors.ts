/**
 * CORS Configuration
 * Extracted from server.mjs for better modularity
 */

import createHttpError from 'http-errors';

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
        // 403, nicht der nackte `Error`: der Global-Error-Handler stuft alles
        // ohne `status` als 500 ein, und Sentry meldet jeden 5xx. Ein fremder
        // Origin ist aber genau das, wogegen die Prüfung schützt — ein
        // erwarteter Client-Fehler, kein Serverausfall. Der Scanner-Verkehr auf
        // /api/graphql hat den Fehlerkanal damit dauerhaft geflutet.
        callback(createHttpError(403, 'Not allowed by CORS'));
      }
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Range',
      // App locale hint sent by the web/desktop client (apiClient). Required in the
      // allowlist or cross-origin clients (e.g. the Tauri webview at tauri://localhost)
      // fail the CORS preflight and every API call is blocked.
      'X-User-Locale',
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
