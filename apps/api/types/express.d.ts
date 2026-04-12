import type { AIWorkerPool } from './workers';
import type { SharepicImageManager } from '../services/image/types';
import type { UserProfile } from '../services/user/types';
import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    // Express.User is augmented to match UserProfile — declaration merging with
    // Passport's empty `interface User {}` only merges members, not extends clauses,
    // so we inline the fields via type intersection at the Request level instead.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends UserProfile {}

    interface Request {
      user?: UserProfile | undefined;
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
