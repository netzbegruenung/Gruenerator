/**
 * Sites Routes - Type Definitions
 */

import type { Request } from 'express';
import type { UserProfile } from '../../services/user/types.js';

/**
 * Request type for sites routes
 * Note: Using `any` for Express compatibility with router handlers
 */
export type SitesRequest = Request & {
  user?: UserProfile;
  siteData?: UserSite;
};

export interface UserSite {
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
  sections?: SiteSection[];
  meta_description?: string;
  meta_keywords?: string[];
  is_published: boolean;
  last_published?: string;
  visit_count?: number;
  created_at: string;
  updated_at: string;
}

export interface SiteSection {
  type: 'text' | 'contact' | string;
  title?: string;
  content?: string;
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
  tagline?: string;
  theme?: string;
}

export interface UpdateSiteBody {
  site_title?: string;
  tagline?: string;
  bio?: string;
  contact_email?: string;
  social_links?: Record<string, string>;
  accent_color?: string;
  profile_image?: string;
  background_image?: string;
  sections?: SiteSection[];
  meta_description?: string;
  meta_keywords?: string[];
}

export interface PublishBody {
  publish: boolean;
}

export interface CheckSubdomainQuery {
  subdomain?: string;
}

export interface SiteResponse {
  site: UserSite | null;
  error?: string;
}

export interface SitesErrorResponse {
  error: string;
}

export interface SubdomainCheckResponse {
  available: boolean;
  reason?: 'invalid' | 'reserved';
  error?: string;
}

export interface ThemesResponse {
  themes: Theme[];
}

export interface SuccessResponse {
  success: boolean;
  error?: string;
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
