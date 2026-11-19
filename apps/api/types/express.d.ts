import type { UserProfile } from '@gruenerator/contracts';
import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    // Express.User is the canonical UserProfile from @gruenerator/contracts.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends UserProfile {}

    interface Request {
      user?: User | undefined;
      mobileAuth?: boolean | undefined;
      jwtToken?: string | undefined;
      sessionID?: string | undefined;
    }
  }
}

export type AuthMiddleware = (req: Request, res: Response, next: NextFunction) => void;
export type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
