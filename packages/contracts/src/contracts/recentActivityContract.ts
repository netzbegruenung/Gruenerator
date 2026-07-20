/**
 * ts-rest contract for /api/recent-activity (workplace "Zuletzt" section).
 *
 * Single read endpoint that aggregates the user's recent docs, boards, images,
 * reels and canvases. Consumed by the workplace RecentlyCreatedSection and
 * ReelsSection, which previously hand-typed two divergent `RecentItem`
 * interfaces over the same response.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  recentActivityResponseSchema,
  recentActivityErrorSchema,
} from '../schemas/recentActivity.js';

const c = initContract();

export const recentActivityContract = c.router(
  {
    /**
     * GET /api/recent-activity?limit=N
     * Returns the merged, date-sorted recent-activity list (capped at 30 by
     * the backend; defaults to 12 when limit is absent/invalid).
     */
    getRecentActivity: {
      method: 'GET',
      path: '/api/recent-activity',
      query: z.object({
        limit: z.string().optional(), // query params are always strings
      }),
      responses: {
        200: recentActivityResponseSchema,
        500: recentActivityErrorSchema,
      },
      summary: 'List the current user’s recent activity',
    },
  },
  { pathPrefix: '' }
);
