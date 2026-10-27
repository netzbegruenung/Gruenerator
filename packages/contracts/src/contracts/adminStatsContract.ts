/**
 * ts-rest contract for the instance-admin statistics view (read-only).
 * `requireInstanceAdmin`-gated per handler, `requireAuth` at the mount prefix —
 * the same shape as instanceAdminOverviewContract. Counts only; see
 * schemas/adminStats.ts for what is suppressed and why.
 */
import { initContract } from '@ts-rest/core';

import {
  adminStatsErrorResponseSchema,
  adminStatsQuerySchema,
  getAdminStatsResponseSchema,
} from '../schemas/adminStats.js';

const c = initContract();

export const adminStatsContract = c.router(
  {
    /**
     * GET /api/auth/admin/statistics?from=2026-01-01&bucket=month&locale=at
     * Created-content counts per kind and bucket, live and from the counter.
     */
    getStats: {
      method: 'GET',
      path: '/api/auth/admin/statistics',
      query: adminStatsQuerySchema,
      responses: {
        200: getAdminStatsResponseSchema,
        400: adminStatsErrorResponseSchema,
        401: adminStatsErrorResponseSchema,
        403: adminStatsErrorResponseSchema,
        500: adminStatsErrorResponseSchema,
      },
      summary: 'Anonymous created-content counts for this deployment (instance admin)',
    },
  },
  { pathPrefix: '' }
);
