/**
 * ts-rest contract for /api/item-usage
 *
 * Read-only: returns the current user's usage aggregate for one item type so
 * the client can rank static lists (system notebooks / agents) the same way the
 * server ranks user notebooks / agents. Writes happen server-side from the chat
 * stream and notebook QA paths — there is no client write endpoint.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  itemUsageTypeSchema,
  getItemUsageResponseSchema,
  itemUsageErrorResponseSchema,
} from '../schemas/itemUsage.js';

const c = initContract();

export const itemUsageContract = c.router(
  {
    /**
     * GET /api/item-usage?type=notebook|agent
     * List the current user's usage stats for the given item type.
     */
    getUsage: {
      method: 'GET',
      path: '/api/item-usage',
      query: z.object({ type: itemUsageTypeSchema }),
      responses: {
        200: getItemUsageResponseSchema,
        400: itemUsageErrorResponseSchema,
        500: itemUsageErrorResponseSchema,
      },
      summary: 'Get usage stats for notebooks or agents',
    },
  },
  { pathPrefix: '' }
);
