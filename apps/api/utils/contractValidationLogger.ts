import { type RequestValidationError } from '@ts-rest/express';
import { type Request, type Response, type NextFunction } from 'express';
import { type Logger } from 'winston';

/**
 * Shared validation-error handler for ts-rest contract routers.
 *
 * ts-rest's default mode silently 400s with the validation errors in the
 * response body but never logs them server-side. This helper logs which
 * scope, which method+url, and exactly which Zod issues were raised on
 * body/query/path-params, then sends ts-rest's own 400 response — so the
 * next time we hit a body validation issue we can see it in the API logs
 * without parsing browser response bodies.
 *
 * Answering here is load-bearing: a custom handler *replaces* ts-rest's
 * built-in one, so `next(err)` would hand a status-less Error to the global
 * error handler, which turns every malformed request into a 500 (ERROR log
 * with stack + Sentry capture). A too-long query string in a search box was
 * enough to fill the log with 500s.
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

/**
 * `req` is typed structurally rather than as `Request`: ts-rest hands the
 * handler a `TsRestRequest` whose parsed `query` (coerced numbers) no longer
 * satisfies Express' `ParsedQs` index signature. Only method and originalUrl
 * are read here, so asking for less keeps every contract router assignable.
 */
type ValidationLogRequest = Pick<Request, 'method' | 'originalUrl'>;

/** A rejected request can carry a multi-KB URL; the tail adds nothing to triage. */
const MAX_LOGGED_URL = 200;

export function logContractValidationError(log: Logger, scope: string) {
  return (
    err: RequestValidationError,
    req: ValidationLogRequest,
    res: Response,
    next: NextFunction
  ): void => {
    const reqWithFlag = req as ValidationLogRequest & { [LOGGED_FLAG]?: true };
    if (!reqWithFlag[LOGGED_FLAG]) {
      reqWithFlag[LOGGED_FLAG] = true;
      const url =
        req.originalUrl.length > MAX_LOGGED_URL
          ? `${req.originalUrl.slice(0, MAX_LOGGED_URL)}… (${req.originalUrl.length} chars)`
          : req.originalUrl;
      // warn, not error: a malformed request is the client's bug, not an outage.
      log.warn(
        '[%s] validation failed: %s %s — body=%j, query=%j, params=%j',
        scope,
        req.method,
        url,
        err.body?.issues,
        err.query?.issues,
        err.pathParams?.issues
      );
    }

    if (res.headersSent) {
      next(err);
      return;
    }
    // Mirrors ts-rest's built-in `'default'` handler, which this one replaces.
    const issues = err.pathParams ?? err.headers ?? err.query ?? err.body;
    res.status(400).json(issues ?? { message: '[ts-rest] request validation failed' });
  };
}
