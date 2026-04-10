import { type NextFunction, type Request, type Response } from 'express';
import { type ZodType, type ZodError } from 'zod';

type TypedRequest<T> = Omit<Request, 'body'> & { body: T };

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
