import type { Request, Response, NextFunction } from 'express';
import type { Session, SessionData } from 'express-session';
import type { User } from './auth';
import type { AIWorkerPool } from './workers';

declare module 'express-session' {
  interface SessionData {
    passport?: {
      user?: User;
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
    interface Request {
      user?: User;
      session: Session & SessionData;
      subdomain?: string;
      siteData?: {
        id: string;
        subdomain: string;
        name: string;
        settings: Record<string, unknown>;
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
