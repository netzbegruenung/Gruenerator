/**
 * ts-rest contract for user-created agent CRUD endpoints.
 *
 * Covers the routes from apps/api/routes/userAgents/userAgentsContractRouter.ts.
 * All routes require authentication (requireAuth is applied at the
 * /api/user-agents prefix in routes.ts).
 *
 * Route ordering note: `convertCg` (POST /convert-cg/:slug) is a literal path
 * under POST, distinct from `create` (POST /), so no ordering hazard. `get`,
 * `update`, `remove` share the `:identifier` param route.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  createUserAgentBodySchema,
  updateUserAgentBodySchema,
  userAgentsListResponseSchema,
  userAgentItemResponseSchema,
  userAgentDeleteResponseSchema,
  userAgentErrorResponseSchema,
} from '../schemas/userAgents.js';

const c = initContract();

export const userAgentsContract = c.router(
  {
    /** GET /api/user-agents — the caller's own agents (+ virtualized custom generators). */
    list: {
      method: 'GET',
      path: '/api/user-agents',
      responses: {
        200: userAgentsListResponseSchema,
        401: userAgentErrorResponseSchema,
        500: userAgentErrorResponseSchema,
      },
      summary: 'List the current user agents',
    },

    /** POST /api/user-agents — create a custom agent. */
    create: {
      method: 'POST',
      path: '/api/user-agents',
      body: createUserAgentBodySchema,
      responses: {
        201: userAgentItemResponseSchema,
        400: userAgentErrorResponseSchema,
        401: userAgentErrorResponseSchema,
        409: userAgentErrorResponseSchema,
        500: userAgentErrorResponseSchema,
      },
      summary: 'Create a user agent',
    },

    /** POST /api/user-agents/convert-cg/:slug — persist a virtualized custom generator. */
    convertCg: {
      method: 'POST',
      path: '/api/user-agents/convert-cg/:slug',
      pathParams: z.object({ slug: z.string() }),
      body: z.object({}).optional(),
      responses: {
        201: userAgentItemResponseSchema,
        401: userAgentErrorResponseSchema,
        404: userAgentErrorResponseSchema,
        409: userAgentErrorResponseSchema,
        500: userAgentErrorResponseSchema,
      },
      summary: 'Convert a custom generator into a user agent',
    },

    /** GET /api/user-agents/:identifier — a single owned agent. */
    get: {
      method: 'GET',
      path: '/api/user-agents/:identifier',
      pathParams: z.object({ identifier: z.string() }),
      responses: {
        200: userAgentItemResponseSchema,
        401: userAgentErrorResponseSchema,
        404: userAgentErrorResponseSchema,
        500: userAgentErrorResponseSchema,
      },
      summary: 'Get a single user agent',
    },

    /** PATCH /api/user-agents/:identifier — update an owned agent. */
    update: {
      method: 'PATCH',
      path: '/api/user-agents/:identifier',
      pathParams: z.object({ identifier: z.string() }),
      body: updateUserAgentBodySchema,
      responses: {
        200: userAgentItemResponseSchema,
        400: userAgentErrorResponseSchema,
        401: userAgentErrorResponseSchema,
        404: userAgentErrorResponseSchema,
        500: userAgentErrorResponseSchema,
      },
      summary: 'Update a user agent',
    },

    /** DELETE /api/user-agents/:identifier — delete an owned agent. */
    remove: {
      method: 'DELETE',
      path: '/api/user-agents/:identifier',
      pathParams: z.object({ identifier: z.string() }),
      responses: {
        200: userAgentDeleteResponseSchema,
        401: userAgentErrorResponseSchema,
        404: userAgentErrorResponseSchema,
        500: userAgentErrorResponseSchema,
      },
      summary: 'Delete a user agent',
    },
  },
  { pathPrefix: '' }
);
