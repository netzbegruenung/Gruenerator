/**
 * ts-rest contract for the admin reports queue.
 *
 * Mounted under `/api/auth/admin/reports`: `requireAuth` at the prefix
 * (routes.ts), every handler checks `requireInstanceAdmin` itself.
 */
import { initContract } from '@ts-rest/core';

import {
  adminReportErrorSchema,
  adminReportListQuerySchema,
  adminReportListResponseSchema,
  adminReportResolveBodySchema,
  adminReportResolveResponseSchema,
  adminReportStatsResponseSchema,
} from '../schemas/adminReports.js';

const c = initContract();

const ERRORS = {
  401: adminReportErrorSchema,
  403: adminReportErrorSchema,
  500: adminReportErrorSchema,
} as const;

export const adminReportsContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/api/auth/admin/reports',
      query: adminReportListQuerySchema,
      responses: { 200: adminReportListResponseSchema, ...ERRORS },
      summary: 'Meldungen je Ziel gruppiert (Admin)',
    },
    resolve: {
      method: 'POST',
      path: '/api/auth/admin/reports/resolve',
      body: adminReportResolveBodySchema,
      responses: {
        200: adminReportResolveResponseSchema,
        400: adminReportErrorSchema,
        404: adminReportErrorSchema,
        ...ERRORS,
      },
      summary: 'Alle offenen Meldungen eines Ziels erledigen (Admin)',
    },
    stats: {
      method: 'GET',
      path: '/api/auth/admin/reports/stats',
      responses: { 200: adminReportStatsResponseSchema, ...ERRORS },
      summary: 'Anzahl offener gemeldeter Inhalte (Admin)',
    },
  },
  { pathPrefix: '' }
);
