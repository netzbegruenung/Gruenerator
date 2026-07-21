/**
 * EXPERIMENTAL — ts-rest contract for recurring agent task CRUD.
 *
 * Covers apps/api/routes/recurringTasks/recurringTasksContractRouter.ts. All
 * routes require authentication (requireAuth applied at the /api/recurring-tasks
 * prefix in routes.ts).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  createRecurringTaskBodySchema,
  updateRecurringTaskBodySchema,
  recurringTasksListResponseSchema,
  recurringTaskItemResponseSchema,
  recurringTaskRunsResponseSchema,
  recurringTaskDeleteResponseSchema,
  recurringTaskErrorResponseSchema,
} from '../schemas/recurringTasks.js';

const c = initContract();

export const recurringTasksContract = c.router(
  {
    /** GET /api/recurring-tasks — the caller's own recurring tasks. */
    list: {
      method: 'GET',
      path: '/api/recurring-tasks',
      responses: {
        200: recurringTasksListResponseSchema,
        401: recurringTaskErrorResponseSchema,
        500: recurringTaskErrorResponseSchema,
      },
      summary: 'List the current user recurring tasks',
    },

    /** POST /api/recurring-tasks — create a recurring task. */
    create: {
      method: 'POST',
      path: '/api/recurring-tasks',
      body: createRecurringTaskBodySchema,
      responses: {
        201: recurringTaskItemResponseSchema,
        400: recurringTaskErrorResponseSchema,
        401: recurringTaskErrorResponseSchema,
        500: recurringTaskErrorResponseSchema,
      },
      summary: 'Create a recurring task',
    },

    /** GET /api/recurring-tasks/:id — a single owned task. */
    get: {
      method: 'GET',
      path: '/api/recurring-tasks/:id',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: recurringTaskItemResponseSchema,
        401: recurringTaskErrorResponseSchema,
        404: recurringTaskErrorResponseSchema,
        500: recurringTaskErrorResponseSchema,
      },
      summary: 'Get a single recurring task',
    },

    /** PATCH /api/recurring-tasks/:id — update / enable / disable. */
    update: {
      method: 'PATCH',
      path: '/api/recurring-tasks/:id',
      pathParams: z.object({ id: z.string() }),
      body: updateRecurringTaskBodySchema,
      responses: {
        200: recurringTaskItemResponseSchema,
        400: recurringTaskErrorResponseSchema,
        401: recurringTaskErrorResponseSchema,
        404: recurringTaskErrorResponseSchema,
        500: recurringTaskErrorResponseSchema,
      },
      summary: 'Update a recurring task',
    },

    /** DELETE /api/recurring-tasks/:id — delete an owned task. */
    remove: {
      method: 'DELETE',
      path: '/api/recurring-tasks/:id',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: recurringTaskDeleteResponseSchema,
        401: recurringTaskErrorResponseSchema,
        404: recurringTaskErrorResponseSchema,
        500: recurringTaskErrorResponseSchema,
      },
      summary: 'Delete a recurring task',
    },

    /** POST /api/recurring-tasks/:id/run — run once now (bypass the schedule). */
    runNow: {
      method: 'POST',
      path: '/api/recurring-tasks/:id/run',
      pathParams: z.object({ id: z.string() }),
      body: z.object({}).optional(),
      responses: {
        202: recurringTaskItemResponseSchema,
        401: recurringTaskErrorResponseSchema,
        404: recurringTaskErrorResponseSchema,
        500: recurringTaskErrorResponseSchema,
      },
      summary: 'Run a recurring task once immediately',
    },

    /** GET /api/recurring-tasks/:id/runs — execution history. */
    listRuns: {
      method: 'GET',
      path: '/api/recurring-tasks/:id/runs',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: recurringTaskRunsResponseSchema,
        401: recurringTaskErrorResponseSchema,
        404: recurringTaskErrorResponseSchema,
        500: recurringTaskErrorResponseSchema,
      },
      summary: 'List a recurring task run history',
    },
  },
  { pathPrefix: '' }
);
