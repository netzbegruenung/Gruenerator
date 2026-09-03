/**
 * ts-rest contract for the person's explicit memory (`/api/memory`).
 *
 * Mirrors apps/api/routes/memory/memoryContractRouter.ts. All routes are
 * auth-protected (requireAuth at the prefix in routes.ts); the user is always
 * the authenticated one — there is no `:userId` in these paths on purpose.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  createMemoryBodySchema,
  memoryErrorResponseSchema,
  memoryExportResponseSchema,
  memoryItemResponseSchema,
  memoryListResponseSchema,
  memoryOkResponseSchema,
  updateMemoryBodySchema,
} from '../schemas/memory.js';

const c = initContract();

export const memoryContract = c.router(
  {
    /** GET /api/memory — every memory of the authenticated person, oldest first. */
    list: {
      method: 'GET',
      path: '/api/memory',
      responses: {
        200: memoryListResponseSchema,
        401: memoryErrorResponseSchema,
        500: memoryErrorResponseSchema,
      },
      summary: 'List memories',
    },
    /** GET /api/memory/export — the same list as a downloadable JSON (data portability). */
    export: {
      method: 'GET',
      path: '/api/memory/export',
      responses: {
        200: memoryExportResponseSchema,
        401: memoryErrorResponseSchema,
        500: memoryErrorResponseSchema,
      },
      summary: 'Export memories',
    },
    /** POST /api/memory — a memory typed into the settings tab. */
    create: {
      method: 'POST',
      path: '/api/memory',
      body: createMemoryBodySchema,
      responses: {
        200: memoryItemResponseSchema,
        400: memoryErrorResponseSchema,
        401: memoryErrorResponseSchema,
        500: memoryErrorResponseSchema,
      },
      summary: 'Create memory',
    },
    update: {
      method: 'PATCH',
      path: '/api/memory/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: updateMemoryBodySchema,
      responses: {
        200: memoryItemResponseSchema,
        400: memoryErrorResponseSchema,
        401: memoryErrorResponseSchema,
        404: memoryErrorResponseSchema,
        500: memoryErrorResponseSchema,
      },
      summary: 'Update memory text',
    },
    remove: {
      method: 'DELETE',
      path: '/api/memory/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: z.object({}),
      responses: {
        200: memoryOkResponseSchema,
        401: memoryErrorResponseSchema,
        404: memoryErrorResponseSchema,
        500: memoryErrorResponseSchema,
      },
      summary: 'Delete memory',
    },
    /** DELETE /api/memory — everything (GDPR erasure). */
    removeAll: {
      method: 'DELETE',
      path: '/api/memory',
      body: z.object({}),
      responses: {
        200: memoryOkResponseSchema,
        401: memoryErrorResponseSchema,
        500: memoryErrorResponseSchema,
      },
      summary: 'Delete all memories',
    },
  },
  { strictStatusCodes: true }
);

export type MemoryContract = typeof memoryContract;
