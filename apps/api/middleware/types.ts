/**
 * Shared type definitions for middleware
 */

import { Request, Response } from 'express';
import { UserProfile } from '../services/user/types.js';
import type CanvaApiClient from '../services/api-clients/canvaApiClient.js';

// ============================================================================
// Extended Express Request Types
// ============================================================================

/**
 * Base authenticated request with user attached
 */
export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
  isAuthenticated?: () => boolean;
  session?: any;
  mobileAuth?: boolean;
  jwtToken?: any;
}

/**
 * Request with Canva integration
 */
export interface CanvaRequest extends AuthenticatedRequest {
  canvaClient?: ReturnType<typeof CanvaApiClient.forUser> | null;
  canvaAccessToken?: string;
  hasCanvaConnection?: boolean;
}

/**
 * Request with rate limiting context
 */
export interface RateLimitRequest extends AuthenticatedRequest {
  rateLimitContext?: {
    resourceType: string;
    identifier: string;
    userType: string;
    shouldIncrement: boolean;
    status: RateLimitStatus;
  };
  rateLimitInfo?: RateLimitStatus;
  rateLimitWarning?: {
    message: string;
    [key: string]: any;
  };
  rateLimitError?: Error;
}

/**
 * Request with subdomain information
 */
export interface SubdomainRequest extends Request {
  subdomain?: string;
  siteData?: UserSiteData;
}

// ============================================================================
// Middleware-specific Types
// ============================================================================

/**
 * Rate limit status information
 */
export interface RateLimitStatus {
  canGenerate: boolean;
  count: number;
  limit: number;
  remaining: number;
  window: string;
  unlimited?: boolean;
  error?: string;
}

/**
 * User site data for subdomain handler
 */
export interface UserSiteData {
  id: string;
  subdomain: string;
  is_published: boolean;
  visit_count: number;
  [key: string]: any;
}

/**
 * Rate limit middleware options
 */
export interface RateLimitMiddlewareOptions {
  autoIncrement?: boolean;
  soft?: boolean;
}

/**
 * Canva rate limit options
 */
export interface CanvaRateLimitOptions {
  maxRequests?: number;
  windowMs?: number;
  skipSuccessfulGets?: boolean;
}

/**
 * Database health status
 */
export interface DatabaseHealth {
  status: 'connecting' | 'schema_sync' | 'initializing' | 'ready' | 'error';
  isHealthy: boolean;
  isInitialized: boolean;
  lastError: string | null;
  pool?: {
    total: number;
    idle: number;
    waiting: number;
  };
}
