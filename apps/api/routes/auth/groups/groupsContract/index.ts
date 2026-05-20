/**
 * ts-rest contract router for groups: public-group discovery + admin-moderated
 * join requests, plus the migrated legacy core/membership/link and
 * content-sharing routes. Mounted alongside the legacy raw group routes;
 * `requireAuth` is applied at the `/api/auth/groups` prefix in routes.ts.
 *
 * Handlers live in `discovery.ts` / `core.ts` / `content.ts` (bound to their
 * contract routes via `s.route(...)`); this module only composes them.
 *
 * Avatar upload/serve/delete (`/groups/:groupId/avatar`, multer multipart)
 * stays on the legacy raw router — ts-rest models multipart poorly.
 */

import { groupsContract } from '@gruenerator/contracts';
import { createExpressEndpoints } from '@ts-rest/express';

import { logContractValidationError } from '../../../../utils/contractValidationLogger.js';

import { contentRoutes } from './content.js';
import { coreRoutes } from './core.js';
import { discoveryRoutes } from './discovery.js';
import { s, log } from './shared.js';

import type { Application } from 'express';

export const groupsContractRouter = s.router(groupsContract, {
  ...discoveryRoutes,
  ...coreRoutes,
  ...contentRoutes,
});

export function mountGroupsContractRouter(app: Application): void {
  createExpressEndpoints(groupsContract, groupsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'groupsContract'),
  });
}
