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
  user?: UserProfile;
  mobileAuth?: boolean;
  jwtToken?: any;
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
export interface SubdomainRequest extends AuthenticatedRequest {
  subdomain?: string;
  siteData?: UserSiteData;
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
  count?: number;
  limit?: number;
  remaining?: number;
  window?: string;
  unlimited?: boolean;
  error?: string | boolean;
  resourceType?: string;
  userType?: string;
  identifier?: string;
  development?: boolean;
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
  tagline?: string;
  bio?: string;
  contact_email?: string;
  social_links?: Record<string, string>;
  accent_color?: string;
  theme?: string;
  profile_image?: string;
  background_image?: string;
  sections?: Array<{
    type: 'text' | 'contact' | string;
    title?: string;
    content?: string;
  }>;
  meta_description?: string;
  meta_keywords?: string[];
  is_published: boolean;
  last_published?: string;
  visit_count?: number;
  created_at: string;
  updated_at: string;
}

/**
 * Rate limit middleware options
 */
export interface RateLimitMiddlewareOptions {
  autoIncrement?: boolean;
  soft?: boolean;
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
    total?: number;
    idle?: number;
    waiting?: number;
    active?: number;
    maxConnections?: number;
    totalCount?: number;
    idleCount?: number;
    waitingCount?: number;
    initialized?: boolean;
  } | null;
}
