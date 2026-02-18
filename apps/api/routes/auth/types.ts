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
  user?: UserProfile & {
    _redirectTo?: string;
    _originDomain?: string;
    _profileSyncPending?: boolean;
    _profileSyncError?: any;
    id_token?: string;
  };
}

/**
 * Request with session typing for auth flows
 */
export interface AuthSessionRequest extends AuthRequest {
  session: AuthRequest['session'] & {
    redirectTo?: string;
    preferredSource?: string;
    isRegistration?: boolean;
    originDomain?: string;
    messages?: string[];
    passport?: {
      user?: UserProfile;
    };
  };
}

// ============================================================================
// Route Body Types
// ============================================================================

export interface LocaleUpdateBody {
  locale: 'de-DE' | 'de-AT';
}

export interface ProfileUpdateBody {
  display_name?: string;
  username?: string;
  avatar_robot_id?: number;
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
  defaults: Record<string, any>;
}

export interface DeleteAccountBody {
  confirmation: string;
}

// ============================================================================
// Content Route Types
// ============================================================================

export interface SaveToLibraryBody {
  content: string;
  generatorType?: string;
  title?: string;
  metadata?: Record<string, any>;
}

export interface InstructionsUpdateBody {
  instructions?: string;
  knowledge?: Array<{
    id?: string;
    title: string;
    content: string;
    knowledge_type?: string;
    tags?: string[];
  }>;
}

export interface SavedTextMetadataBody {
  title?: string;
  generator_type?: string;
  metadata?: Record<string, any>;
}

export interface SavedTextContentBody {
  content: string;
}

export interface BulkDeleteBody {
  ids: string[];
}

export interface SearchSavedTextsBody {
  query: string;
  limit?: number;
  threshold?: number;
}

// ============================================================================
// Custom Generator Types
// ============================================================================

export interface CustomGeneratorCreateBody {
  name: string;
  description?: string;
  prompt_template: string;
  category?: string;
  icon?: string;
  is_public?: boolean;
}

export interface CustomGeneratorUpdateBody extends Partial<CustomGeneratorCreateBody> {
  id: string;
}

// ============================================================================
// Group Types
// ============================================================================

export interface GroupCreateBody {
  name: string;
  description?: string;
}

export interface GroupUpdateBody {
  name?: string;
  description?: string;
}

export interface GroupJoinBody {
  joinToken: string;
}

export interface GroupInstructionsUpdateBody {
  instructions: string;
}

export interface GroupKnowledgeBody {
  title: string;
  content: string;
  knowledge_type?: string;
  tags?: string[];
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
    canEdit?: boolean;
    canDelete?: boolean;
  };
}

export interface GroupContentPermissionsBody {
  canEdit?: boolean;
  canDelete?: boolean;
}

// ============================================================================
// Wolke (Nextcloud) Types
// ============================================================================

export interface WolkeShareLinkBody {
  shareLink: string;
  label?: string;
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
  description?: string;
  template_type: string;
  template_data: Record<string, any>;
  tags?: string[];
  is_public?: boolean;
}

export type UserTemplateUpdateBody = Partial<UserTemplateCreateBody>;

export interface TemplateFromUrlBody {
  url: string;
  name?: string;
  description?: string;
}

export interface TemplateMetadataBody {
  name?: string;
  description?: string;
  tags?: string[];
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
  message?: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  message?: string;
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
