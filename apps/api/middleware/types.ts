/**
 * Shared type definitions for middleware
 */

import { type Request } from 'express';

import { type UserProfile } from '../services/user/types.js';

import type { ParamsDictionary } from 'express-serve-static-core';

// ============================================================================
// Extended Express Request Types
// ============================================================================

/**
 * Base authenticated request with user attached
 * Extends Express Request to maintain compatibility with router handlers
 */
export interface AuthenticatedRequest<P = ParamsDictionary> extends Request<P> {
  user?: UserProfile | undefined;
  mobileAuth?: boolean | undefined;
  jwtToken?: string | undefined;
  sessionID?: string | undefined;
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
  rateLimitInfo?: RateLimitStatus | undefined;
  rateLimitWarning?: {
    message: string;
    [key: string]: unknown;
  };
  rateLimitError?: Error | undefined;
}

/**
 * Request with subdomain information
 */
export interface SubdomainRequest extends AuthenticatedRequest {
  subdomain?: string | undefined;
}

// ============================================================================
// Middleware-specific Types
// ============================================================================

/**
 * Rate limit status information
 * Compatible with RateLimitStatus from redis/types
 */
export interface RateLimitStatus {
  canGenerate: boolean;
  count?: number | undefined;
  limit?: number | undefined;
  remaining?: number | undefined;
  window?: string | undefined;
  unlimited?: boolean | undefined;
  error?: string | boolean | undefined;
  resourceType?: string | undefined;
  userType?: string | undefined;
  identifier?: string | undefined;
  development?: boolean | undefined;
}

/**
 * User site data for subdomain handler
 * Matches the UserSite type from routes/sites/types.ts
 */
export interface UserSiteData {
  id: string;
  user_id: string;
  subdomain: string;
  site_title: string;
  tagline?: string | undefined;
  bio?: string | undefined;
  contact_email?: string | undefined;
  social_links?: Record<string, string> | undefined;
  accent_color?: string | undefined;
  theme?: string | undefined;
  profile_image?: string | undefined;
  background_image?: string | undefined;
  sections?: Array<{
    type: 'text' | 'contact' | string;
    title?: string | undefined;
    content?: string | undefined;
  }>;
  meta_description?: string | undefined;
  meta_keywords?: string[] | undefined;
  is_published: boolean;
  last_published?: string | undefined;
  visit_count?: number | undefined;
  created_at: string;
  updated_at: string;
}

/**
 * Rate limit middleware options
 */
export interface RateLimitMiddlewareOptions {
  autoIncrement?: boolean | undefined;
  soft?: boolean | undefined;
}

/**
 * Database health status
 * Compatible with HealthStatus from PostgresService
 */
export interface DatabaseHealth {
  status: 'connecting' | 'schema_sync' | 'initializing' | 'ready' | 'error' | 'healthy';
  isHealthy: boolean;
  isInitialized: boolean;
  lastError: string | null;
  pool?: {
    total?: number | undefined;
    idle?: number | undefined;
    waiting?: number | undefined;
    active?: number | undefined;
    maxConnections?: number | undefined;
    totalCount?: number | undefined;
    idleCount?: number | undefined;
    waitingCount?: number | undefined;
    initialized?: boolean | undefined;
  } | null;
}
