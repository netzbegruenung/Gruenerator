/**
 * Sites Routes - Type Definitions
 */

import type { UserProfile } from '../../services/user/types.js';
import type { SiteSections } from '@gruenerator/contracts';
import type { Request } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

/**
 * Request type for sites routes
 * Note: Using `any` for Express compatibility with router handlers
 */
export type SitesRequest<P = ParamsDictionary> = Request<P> & {
  user?: UserProfile | undefined;
  siteData?: UserSite | undefined;
};

export interface UserSite {
  id: string;
  user_id: string;
  subdomain: string;
  site_title: string;
  tagline?: string | undefined;
  contact_email?: string | undefined;
  social_links?: Record<string, string> | undefined;
  accent_color?: string | undefined;
  theme?: string | undefined;
  profile_image?: string | undefined;
  background_image?: string | undefined;
  sections?: SiteSections | undefined;
  meta_description?: string | undefined;
  meta_keywords?: string[] | undefined;
  is_published: boolean;
  last_published?: string | undefined;
  visit_count?: number | undefined;
  created_at: string;
  updated_at: string;
}

export interface ThemeColors {
  primary: string;
  background: string;
  text: string;
  card: string;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
}

export interface CreateSiteBody {
  subdomain: string;
  site_title: string;
  tagline?: string | undefined;
  theme?: string | undefined;
  contact_email?: string | undefined;
  social_links?: Record<string, string> | undefined;
  profile_image?: string | undefined;
  background_image?: string | undefined;
  sections?: SiteSections | undefined;
}

export interface UpdateSiteBody {
  site_title?: string | undefined;
  tagline?: string | undefined;
  contact_email?: string | undefined;
  social_links?: Record<string, string> | undefined;
  accent_color?: string | undefined;
  profile_image?: string | undefined;
  background_image?: string | undefined;
  sections?: SiteSections | undefined;
  meta_description?: string | undefined;
  meta_keywords?: string[] | undefined;
}

export interface PublishBody {
  publish: boolean;
}

export interface CheckSubdomainQuery {
  subdomain?: string | undefined;
}

export interface SiteResponse {
  site: UserSite | null;
  error?: string | undefined;
}

export interface SitesErrorResponse {
  error: string;
}

export interface SubdomainCheckResponse {
  available: boolean;
  reason?: 'invalid' | 'reserved' | undefined;
  error?: string | undefined;
}

export interface ThemesResponse {
  themes: Theme[];
}

export interface SuccessResponse {
  success: boolean;
  error?: string | undefined;
}

export const RESERVED_SUBDOMAINS = [
  'www',
  'api',
  'admin',
  'app',
  'mail',
  'ftp',
  'blog',
  'shop',
  'test',
  'dev',
  'staging',
];

export const THEME_STYLES: Record<string, ThemeColors> = {
  gruene: {
    primary: '#46962b',
    background: '#f5f5f5',
    text: '#2c3e50',
    card: '#ffffff',
  },
  modern: {
    primary: '#2c3e50',
    background: '#ffffff',
    text: '#1a1a1a',
    card: '#f8f9fa',
  },
  professional: {
    primary: '#34495e',
    background: '#f8f9fa',
    text: '#2c3e50',
    card: '#ffffff',
  },
};

/**
 * Dark-mode surface palette for published sites. Applied via
 * `@media (prefers-color-scheme: dark)` so a published page follows the
 * visitor's OS setting. Brand `primary` (the accent_color) is unchanged.
 */
export const THEME_STYLES_DARK: Record<
  string,
  Pick<ThemeColors, 'background' | 'text' | 'card'>
> = {
  gruene: { background: '#1b1b1b', text: '#e6e6e6', card: '#262626' },
  modern: { background: '#161616', text: '#ededed', card: '#202020' },
  professional: { background: '#1a1a1a', text: '#e6e6e6', card: '#242424' },
};

export const AVAILABLE_THEMES: Theme[] = [
  {
    id: 'gruene',
    name: 'Grüne Classic',
    description: 'Klassisches Design in Grünen-Farben',
    primaryColor: '#46962b',
    secondaryColor: '#64a70b',
  },
  {
    id: 'modern',
    name: 'Modern Minimal',
    description: 'Modernes, minimalistisches Design',
    primaryColor: '#2c3e50',
    secondaryColor: '#3498db',
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Professionelles Business-Design',
    primaryColor: '#34495e',
    secondaryColor: '#95a5a6',
  },
];
