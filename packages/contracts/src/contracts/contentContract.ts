/**
 * ts-rest contract for GET /api/content.
 *
 * One typed read surface over the user's own content, with the two properties
 * `/api/recent-activity` cannot offer: server-side filtering by kind *before*
 * the limit, and keyset pagination.
 *
 * Additive. `/api/recent-activity`, `/api/share/*` and `/api/media/*` stay live;
 * consumers move over one surface at a time.
 */
import { initContract } from '@ts-rest/core';

import {
  contentQuerySchema,
  contentResponseSchema,
  contentErrorSchema,
} from '../schemas/content.js';

const c = initContract();

export const contentContract = c.router(
  {
    /**
     * GET /api/content?kind=image,video&limit=20&cursor=…
     *
     * Without `kind` all five kinds are merged. With one or more kinds only
     * those are queried, and `limit` applies to the filtered set — so
     * `?kind=video&limit=30` returns 30 reels no matter how many newer
     * documents exist.
     *
     * 400 is returned when the cursor is malformed or was issued for a
     * different `kind` filter; silently paginating across a changed filter
     * would skip and duplicate rows.
     */
    listContent: {
      method: 'GET',
      path: '/api/content',
      query: contentQuerySchema,
      responses: {
        200: contentResponseSchema,
        400: contentErrorSchema,
        500: contentErrorSchema,
      },
      summary: 'List the current user’s content, filterable by kind and paginated',
    },
  },
  { pathPrefix: '' }
);
