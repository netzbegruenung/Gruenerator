/**
 * Type definitions for auth routes
 */

import { type Request, type Response, type NextFunction } from 'express';

import { type UserProfile } from '../../services/user/types.js';

import type { ParamsDictionary } from 'express-serve-static-core';

// ============================================================================
// Request Types
// ============================================================================

/**
 * Authenticated request with user attached
 */
export interface AuthRequest<P = ParamsDictionary> extends Request<P> {
  user?: UserProfile | undefined;
}

// ============================================================================
// Route Body Types
// ============================================================================

export interface LocaleUpdateBody {
  locale: 'de-DE' | 'de-AT';
}

export interface ProfileUpdateBody {
  display_name?: string | undefined;
  username?: string | undefined;
  avatar_robot_id?: number | undefined;
}

export interface AvatarUpdateBody {
  avatar_robot_id: number;
}

export interface BetaFeatureToggleBody {
  feature: string;
  enabled: boolean;
}

export interface MessageColorUpdateBody {
  color: string;
}

export interface UserDefaultUpdateBody {
  generator_type: string;
  defaults: Record<string, unknown>;
}

export interface DeleteAccountBody {
  confirmation: string;
}

// ============================================================================
// Content Route Types
// ============================================================================

export interface SaveToLibraryBody {
  content: string;
  generatorType?: string | undefined;
  title?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface InstructionsUpdateBody {
  instructions?: string | undefined;
  knowledge?: Array<{
    id?: string | undefined;
    title: string;
    content: string;
    knowledge_type?: string | undefined;
    tags?: string[] | undefined;
  }>;
}

export interface SavedTextMetadataBody {
  title?: string | undefined;
  generator_type?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface SavedTextContentBody {
  content: string;
}

export interface BulkDeleteBody {
  ids: string[];
}

export interface SearchSavedTextsBody {
  query: string;
  limit?: number | undefined;
  threshold?: number | undefined;
}

// ============================================================================
// Custom Generator Types
// ============================================================================

export interface CustomGeneratorCreateBody {
  name: string;
  description?: string | undefined;
  prompt_template: string;
  category?: string | undefined;
  icon?: string | undefined;
  is_public?: boolean | undefined;
}

export interface CustomGeneratorUpdateBody extends Partial<CustomGeneratorCreateBody> {
  id: string;
}

// ============================================================================
// Group Types
// ============================================================================

export interface GroupCreateBody {
  name: string;
  description?: string | undefined;
}

export interface GroupUpdateBody {
  name?: string | undefined;
  description?: string | undefined;
}

export interface GroupJoinBody {
  joinToken: string;
}

export interface GroupInstructionsUpdateBody {
  instructions: string;
}

export interface GroupContentShareBody {
  contentType:
    | 'documents'
    | 'custom_generators'
    | 'notebook_collections'
    | 'user_documents'
    | 'database';
  contentId: string;
  permissions?: {
    canEdit?: boolean | undefined;
    canDelete?: boolean | undefined;
  };
}

export interface GroupContentPermissionsBody {
  canEdit?: boolean | undefined;
  canDelete?: boolean | undefined;
}

// ============================================================================
// Wolke (Nextcloud) Types
// ============================================================================

export interface WolkeShareLinkBody {
  shareLink: string;
  label?: string | undefined;
}

export interface WolkeTestConnectionBody {
  shareLinkId: string;
}

export interface WolkeSyncBody {
  shareLinkId: string;
}

export interface WolkeAutoSyncBody {
  shareLinkId: string;
  enabled: boolean;
}

// ============================================================================
// Template Types
// ============================================================================

export interface UserTemplateCreateBody {
  name: string;
  description?: string | undefined;
  template_type: string;
  template_data: Record<string, unknown>;
  tags?: string[] | undefined;
  is_public?: boolean | undefined;
}

export type UserTemplateUpdateBody = Partial<UserTemplateCreateBody>;

export interface TemplateFromUrlBody {
  url: string;
  name?: string | undefined;
  description?: string | undefined;
}

export interface TemplateMetadataBody {
  name?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
}

// ============================================================================
// Response Types
// ============================================================================

export interface AuthStatusResponse {
  isAuthenticated: boolean;
  user: UserProfile | null;
}

export interface SuccessResponse {
  success: boolean;
  message?: string | undefined;
}

export interface ErrorResponse {
  success: false;
  error: string;
  message?: string | undefined;
}

// ============================================================================
// Helper Types
// ============================================================================

export type AsyncRouteHandler = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => Promise<void>;

export type RouteHandler = (req: AuthRequest, res: Response, next: NextFunction) => void;
