/**
 * ts-rest contract for admin Vorlagen (template review) endpoints.
 *
 * Covers 4 routes from apps/api/routes/auth/templates/adminTemplates.ts.
 * All routes require authentication + is_admin check (enforced in the handler
 * via verifyAdmin; requireAuth middleware is applied at the auth router level).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  adminVorlagenListResponseSchema,
  adminVorlagenStatsResponseSchema,
  adminVorlagenSuccessResponseSchema,
  adminVorlagenErrorResponseSchema,
  rejectVorlageBodySchema,
} from '../schemas/adminVorlagen.js';

const c = initContract();

export const adminVorlagenContract = c.router(
  {
    /**
     * GET /api/auth/admin/vorlagen
     * List templates pending admin review (or by status).
     */
    list: {
      method: 'GET',
      path: '/api/auth/admin/vorlagen',
      query: z.object({
        status: z.string().nullish(),
        limit: z.string().nullish(),
        offset: z.string().nullish(),
      }),
      responses: {
        200: adminVorlagenListResponseSchema,
        401: adminVorlagenErrorResponseSchema,
        403: adminVorlagenErrorResponseSchema,
        500: adminVorlagenErrorResponseSchema,
      },
      summary: 'List admin vorlagen',
    },

    /**
     * GET /api/auth/admin/vorlagen/stats
     * Aggregate counts by status.
     */
    getStats: {
      method: 'GET',
      path: '/api/auth/admin/vorlagen/stats',
      responses: {
        200: adminVorlagenStatsResponseSchema,
        401: adminVorlagenErrorResponseSchema,
        403: adminVorlagenErrorResponseSchema,
        500: adminVorlagenErrorResponseSchema,
      },
      summary: 'Get vorlagen review stats',
    },

    /**
     * POST /api/auth/admin/vorlagen/:id/approve
     * Approve a template for publication.
     */
    approve: {
      method: 'POST',
      path: '/api/auth/admin/vorlagen/:id/approve',
      body: z.object({}),
      responses: {
        200: adminVorlagenSuccessResponseSchema,
        401: adminVorlagenErrorResponseSchema,
        403: adminVorlagenErrorResponseSchema,
        404: adminVorlagenErrorResponseSchema,
        500: adminVorlagenErrorResponseSchema,
      },
      summary: 'Approve a vorlage',
    },

    /**
     * POST /api/auth/admin/vorlagen/:id/reject
     * Reject a template with an optional reason.
     */
    reject: {
      method: 'POST',
      path: '/api/auth/admin/vorlagen/:id/reject',
      body: rejectVorlageBodySchema,
      responses: {
        200: adminVorlagenSuccessResponseSchema,
        401: adminVorlagenErrorResponseSchema,
        403: adminVorlagenErrorResponseSchema,
        404: adminVorlagenErrorResponseSchema,
        500: adminVorlagenErrorResponseSchema,
      },
      summary: 'Reject a vorlage',
    },
  },
  { pathPrefix: '' }
);
