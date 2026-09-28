/**
 * ts-rest contract for the Papierkorb (`/api/trash`).
 *
 * Deleting stays on each resource's own DELETE route, which now moves the item
 * here. This contract lists, restores and purges what is in the trash.
 */
import { initContract } from '@ts-rest/core';

import {
  trashEmptyQuerySchema,
  trashErrorSchema,
  trashItemParamsSchema,
  trashItemSchema,
  trashListQuerySchema,
  trashListResponseSchema,
  trashPurgeResponseSchema,
} from '../schemas/trash.js';

const c = initContract();

export const trashContract = c.router(
  {
    /** GET /api/trash?kind=&cursor=&limit= — newest deletion first. */
    list: {
      method: 'GET',
      path: '/api/trash',
      query: trashListQuerySchema,
      responses: {
        200: trashListResponseSchema,
        400: trashErrorSchema,
        404: trashErrorSchema,
        500: trashErrorSchema,
      },
      summary: 'List the current user’s trashed items',
    },
    /** 409 when a live item has since taken the same unique key. */
    restore: {
      method: 'POST',
      path: '/api/trash/:kind/:id/restore',
      pathParams: trashItemParamsSchema,
      body: c.noBody(),
      responses: {
        200: trashItemSchema,
        403: trashErrorSchema,
        404: trashErrorSchema,
        409: trashErrorSchema,
        500: trashErrorSchema,
      },
      summary: 'Restore one trashed item',
    },
    /** Purge one item now instead of after the retention period. */
    purge: {
      method: 'DELETE',
      path: '/api/trash/:kind/:id',
      pathParams: trashItemParamsSchema,
      body: c.noBody(),
      responses: {
        200: trashPurgeResponseSchema,
        403: trashErrorSchema,
        404: trashErrorSchema,
        500: trashErrorSchema,
      },
      summary: 'Permanently delete one trashed item',
    },
    /** Empty the trash, optionally only one kind. */
    empty: {
      method: 'DELETE',
      path: '/api/trash',
      query: trashEmptyQuerySchema,
      body: c.noBody(),
      responses: {
        200: trashPurgeResponseSchema,
        404: trashErrorSchema,
        500: trashErrorSchema,
      },
      summary: 'Permanently delete everything in the trash',
    },
  },
  { pathPrefix: '' }
);
