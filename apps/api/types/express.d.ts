import type { AIWorkerPool } from './workers';
import type { SharepicImageManager } from '../services/image/types';
import type { UserProfile } from '@gruenerator/contracts';
import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    // Express.User is the canonical UserProfile from @gruenerator/contracts.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends UserProfile {}

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
