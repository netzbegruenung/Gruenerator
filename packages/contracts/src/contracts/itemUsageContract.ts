/**
 * ts-rest contract for /api/item-usage
 *
 * Returns the current user's usage aggregate for one item type so
 * the client can rank static lists (system notebooks / agents) the same way the
 * server ranks user notebooks / agents. Writes happen server-side from the chat
 * stream and notebook QA paths — the client only records what it opens itself (projects).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  itemUsageTypeSchema,
  getItemUsageResponseSchema,
  recordItemUsageBodySchema,
  recordItemUsageResponseSchema,
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
      summary: 'Get usage stats for notebooks, agents or projects',
    },
    /**
     * POST /api/item-usage — record one use of an item the client opened
     * (a project page). Chat paths still record server-side.
     */
    recordUsage: {
      method: 'POST',
      path: '/api/item-usage',
      body: recordItemUsageBodySchema,
      responses: {
        200: recordItemUsageResponseSchema,
        500: itemUsageErrorResponseSchema,
      },
      summary: 'Record one use of a notebook, agent or project',
    },
  },
  { pathPrefix: '' }
);
