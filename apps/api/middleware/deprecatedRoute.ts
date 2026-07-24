import { createLogger } from '../utils/logger.js';

import type { Request, Response, NextFunction } from 'express';

const log = createLogger('DeprecatedRoute');
const warned = new Set<string>();

/**
 * Marks a legacy route path as deprecated: sets the `Deprecation` and
 * `Link: <successor>` headers and logs the first hit per path, so we can see in
 * the Backend-Logs whether ausgelieferte Mobile-/Desktop-Builds noch darauf
 * zugreifen, bevor der Alias entfernt wird.
 */
export function deprecatedRoute(successorPath: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', `<${successorPath}>; rel="successor-version"`);

    const key = req.baseUrl || req.path;
    if (!warned.has(key)) {
      warned.add(key);
      log.warn(`Deprecated route ${key} aufgerufen — Nachfolger: ${successorPath}`);
    }
    next();
  };
}
