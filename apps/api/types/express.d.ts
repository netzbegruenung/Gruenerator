import type { Request, Response, NextFunction } from 'express';
import type { Session, SessionData } from 'express-session';
import type { AIWorkerPool } from './workers';

// Define UserProfile shape directly here to avoid circular imports in declaration merging
interface UserProfileShape {
  id: string;
  keycloak_id?: string;
  email: string;
  username?: string;
  display_name?: string;
  avatar_robot_id: number;
  chat_color?: string;
  beta_features: Record<string, boolean>;
  user_defaults: Record<string, Record<string, unknown>>;
  locale?: 'de-DE' | 'de-AT';
  igel_modus: boolean;
  groups_enabled: boolean;
  custom_generators: boolean;
  database_access: boolean;
  collab: boolean;
  notebook: boolean;
  sharepic: boolean;
  anweisungen: boolean;
  canva: boolean;
  labor_enabled: boolean;
  sites_enabled: boolean;
  chat: boolean;
  interactive_antrag_enabled: boolean;
  auto_save_on_export: boolean;
  vorlagen: boolean;
  video_editor: boolean;
  bundestag_api_enabled?: boolean;
  memory_enabled?: boolean;
  canva_user_id?: string;
  created_at: Date | string;
  updated_at: Date | string;
  last_login?: Date | string;
}

declare module 'express-session' {
  interface SessionData {
    passport?: {
      user?: UserProfileShape;
    };
    preferredSource?: string;
    returnTo?: string;
    codeVerifier?: string;
    state?: string;
    originalUrl?: string;
  }
}

declare global {
  namespace Express {
    // Define User as UserProfile for Passport integration
    interface User extends UserProfileShape {}

    interface Request {
      user?: User;
      session: Session & SessionData;
      subdomain?: string;
      siteData?: {
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
      };
      mobileAuth?: boolean;
    }

    interface Locals {
      aiWorkerPool?: AIWorkerPool;
    }
  }
}

export type AuthMiddleware = (req: Request, res: Response, next: NextFunction) => void;
export type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
