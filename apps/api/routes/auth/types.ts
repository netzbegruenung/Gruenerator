/**
 * Type definitions for auth routes
 */

import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';

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
// Group Types (Zod schemas + inferred types)
// ============================================================================

export const groupCreateSchema = z.object({
  name: z.string().min(1, 'Gruppenname ist erforderlich.'),
  description: z.string().optional(),
});
export type GroupCreateBody = z.infer<typeof groupCreateSchema>;

export const groupUpdateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
});
export type GroupUpdateBody = z.infer<typeof groupUpdateSchema>;

export const groupJoinSchema = z.object({
  joinToken: z.string().min(1, 'Beitritts-Token ist erforderlich.'),
});
export type GroupJoinBody = z.infer<typeof groupJoinSchema>;

export const groupInstructionsUpdateSchema = z.object({
  instructions: z.string(),
});
export type GroupInstructionsUpdateBody = z.infer<typeof groupInstructionsUpdateSchema>;

const VALID_CONTENT_TYPES = [
  'documents',
  'custom_generators',
  'notebook_collections',
  'user_documents',
  'database',
  'collaborative_documents',
  'system_notebooks',
  'system_agents',
  'canvas_template',
] as const;

export const groupContentShareSchema = z.object({
  contentType: z.enum(VALID_CONTENT_TYPES),
  contentId: z.string().min(1, 'Content-ID ist erforderlich.'),
  permissions: z
    .object({
      read: z.boolean().optional(),
      write: z.boolean().optional(),
      collaborative: z.boolean().optional(),
    })
    .optional(),
});
export type GroupContentShareBody = z.infer<typeof groupContentShareSchema>;

export const groupContentUnshareSchema = z.object({
  contentType: z.enum(VALID_CONTENT_TYPES),
  contentId: z.string().min(1, 'Content-ID ist erforderlich.'),
});
export type GroupContentUnshareBody = z.infer<typeof groupContentUnshareSchema>;

export const groupContentPermissionsSchema = z.object({
  contentType: z.enum(VALID_CONTENT_TYPES),
  permissions: z.record(z.string(), z.boolean()),
});
export type GroupContentPermissionsBody = z.infer<typeof groupContentPermissionsSchema>;

export const groupContentDeleteSchema = z.object({
  contentType: z.enum(VALID_CONTENT_TYPES),
});
export type GroupContentDeleteBody = z.infer<typeof groupContentDeleteSchema>;

export const groupInfoUpdateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  settings: z
    .object({
      templateTags: z
        .array(z.string().max(50, 'Jeder Tag darf max. 50 Zeichen haben.'))
        .max(20, 'Maximal 20 Tags erlaubt.')
        .optional(),
    })
    .passthrough()
    .optional(),
});
export type GroupInfoUpdateBody = z.infer<typeof groupInfoUpdateSchema>;

export const groupMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member'], {
    errorMap: () => ({ message: 'Rolle muss "admin" oder "member" sein.' }),
  }),
});
export type GroupMemberRoleBody = z.infer<typeof groupMemberRoleSchema>;

const ALLOWED_LINK_ICONS = [
  'globe',
  'link',
  'mail',
  'calendar',
  'chat',
  'folder',
  'phone',
  'video',
  'document',
  'map',
  'signal',
  'whatsapp',
  'telegram',
  'discord',
  'slack',
  'mattermost',
  'canva',
  'figma',
  'miro',
  'drive',
  'nextcloud',
  'notion',
  'trello',
  'github',
  'zoom',
  'googlemeet',
  'youtube',
  'instagram',
  'mastodon',
  'linkedin',
  'x',
] as const;

export const groupLinkSchema = z.object({
  title: z
    .string()
    .min(1, 'Titel ist erforderlich.')
    .max(100, 'Titel darf max. 100 Zeichen haben.'),
  url: z.string().regex(/^https?:\/\/.+/, 'URL muss mit http:// oder https:// beginnen.'),
  icon: z.enum(ALLOWED_LINK_ICONS, {
    errorMap: () => ({ message: `Ungültiges Icon. Erlaubt: ${ALLOWED_LINK_ICONS.join(', ')}` }),
  }),
  description: z.string().max(300, 'Beschreibung darf max. 300 Zeichen haben.').optional(),
});
export type GroupLinkBody = z.infer<typeof groupLinkSchema>;

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
