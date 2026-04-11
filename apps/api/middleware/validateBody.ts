import { type NextFunction, type Request, type Response } from 'express';
import { type ZodType, type ZodError } from 'zod';

import { type UserProfile } from '../services/user/types.js';

import type { ParamsDictionary } from 'express-serve-static-core';

/**
 * Request with a validated, typed body.
 *
 * Use this INSTEAD of intersecting with AuthenticatedRequest/Request:
 *   Good: `req: TypedRequest<MyBody>`
 *   Bad:  `req: TypedRequest<MyBody> & AuthenticatedRequest` (body becomes `any`)
 *
 * Includes `user?` from AuthenticatedRequest so intersection is unnecessary.
 * Use the `P` generic for route params: `TypedRequest<MyBody, { id: string }>`.
 */
interface TypedRequest<T, P = ParamsDictionary> extends Omit<Request<P>, 'body'> {
  body: T;
  user?: UserProfile | undefined;
  mobileAuth?: boolean | undefined;
  jwtToken?: string | undefined;
  sessionID?: string | undefined;
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: formatZodError(result.error),
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    (req as TypedRequest<T>).body = result.data;
    next();
  };
}

export type { TypedRequest };
