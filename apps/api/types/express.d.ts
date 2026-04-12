import type { AIWorkerPool } from './workers';
import type { SharepicImageManager } from '../services/image/types';
import type { Request, Response, NextFunction } from 'express';

interface UserProfileShape {
  id: string;
  keycloak_id?: string | undefined;
  email: string;
  username?: string | undefined;
  display_name?: string | undefined;
  avatar_robot_id: number;
  chat_color?: string | undefined;
  beta_features: Record<string, boolean>;
  user_defaults: Record<string, Record<string, unknown>>;
  locale?: 'de-DE' | 'de-AT' | undefined;
  groups_enabled: boolean;
  custom_generators: boolean;
  database_access: boolean;
  collab: boolean;
  notebook: boolean;
  sharepic: boolean;
  anweisungen: boolean;
  labor_enabled: boolean;
  sites_enabled: boolean;
  chat: boolean;
  interactive_antrag_enabled: boolean;
  vorlagen: boolean;
  video_editor: boolean;
  bundestag_api_enabled?: boolean | undefined;
  memory_enabled?: boolean | undefined;
  wordpress_enabled?: boolean | undefined;
  created_at: Date | string;
  updated_at: Date | string;
  last_login?: Date | string | undefined;
}

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends UserProfileShape {}

    interface Request {
      user?: User | undefined;
      subdomain?: string | undefined;
      mobileAuth?: boolean | undefined;
      jwtToken?: string | undefined;
      sessionID?: string | undefined;
      siteData?: {
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
      };
    }

    interface Locals {
      aiWorkerPool?: AIWorkerPool | undefined;
      sharepicImageManager?: SharepicImageManager | undefined;
    }
  }
}

export type AuthMiddleware = (req: Request, res: Response, next: NextFunction) => void;
export type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
