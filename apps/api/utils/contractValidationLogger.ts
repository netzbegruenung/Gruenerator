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
 * **Deduplication**: Express runs ALL registered error middlewares in
 * sequence when `next(err)` is called, so without dedup we'd log N times
 * for one request (once per mounted contract router, since each
 * `createExpressEndpoints` call registers its own error middleware). We
 * mark the request after the first log and skip on subsequent invocations.
 *
 * Usage in a contract router mount function:
 *   createExpressEndpoints(myContract, myRouter, app, {
 *     requestValidationErrorHandler: logContractValidationError(log, 'myContract'),
 *   });
 */
const LOGGED_FLAG = Symbol.for('contractValidationErrorLogged');

export function logContractValidationError(log: Logger, scope: string) {
  return (err: RequestValidationError, req: Request, _res: Response, next: NextFunction): void => {
    const reqWithFlag = req as Request & { [LOGGED_FLAG]?: true };
    if (!reqWithFlag[LOGGED_FLAG]) {
      reqWithFlag[LOGGED_FLAG] = true;
      log.error(
        '[%s] validation failed: %s %s — body=%j, query=%j, params=%j',
        scope,
        req.method,
        req.originalUrl,
        err.body?.issues,
        err.query?.issues,
        err.pathParams?.issues
      );
    }
    next(err);
  };
}
