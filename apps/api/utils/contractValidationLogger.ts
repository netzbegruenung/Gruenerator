import { type RequestValidationError } from '@ts-rest/express';
import { type Request, type Response, type NextFunction } from 'express';
import { type Logger } from 'winston';

/**
 * Shared validation-error handler for ts-rest contract routers.
 *
 * ts-rest's default `'combined'` mode silently 400s with the validation
 * errors in the response body but never logs them server-side. This helper
 * logs which scope, which method+url, and exactly which Zod issues were
 * raised on body/query/path-params before falling through to the default
 * 400 response — so the next time we hit a body validation issue we can
 * see it in the API logs without parsing browser response bodies.
 *
 * Usage in a contract router mount function:
 *   createExpressEndpoints(myContract, myRouter, app, {
 *     requestValidationErrorHandler: logContractValidationError(log, 'myContract'),
 *   });
 */
export function logContractValidationError(log: Logger, scope: string) {
  return (err: RequestValidationError, req: Request, _res: Response, next: NextFunction): void => {
    log.error(
      '[%s] validation failed: %s %s — body=%j, query=%j, params=%j',
      scope,
      req.method,
      req.originalUrl,
      err.body?.issues,
      err.query?.issues,
      err.pathParams?.issues
    );
    next(err);
  };
}
