/**
 * ts-rest contract for the Bundesgeschäftsstelle-instance admin overview.
 * Read-only except for the „Panda" unlock and the admin grant, `is_admin`-gated (requireInstanceAdmin, enforced per-handler
 * like adminVorlagenContract/skillVisibilityContract). Rezepte-Sichtbarkeit
 * is intentionally NOT duplicated here — the existing skillVisibilityContract
 * already runs on this deployment; the BGST admin UI just links to it.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  instanceAdminAppBundlesResponseSchema,
  instanceAdminSetAdminBodySchema,
  instanceAdminSetPandaBodySchema,
  instanceAdminUserResponseSchema,
  instanceAdminUsersQuerySchema,
  instanceAdminUsersResponseSchema,
  instanceAdminRolesResponseSchema,
  instanceAdminOverviewErrorResponseSchema,
} from '../schemas/instanceAdminOverview.js';

const c = initContract();

export const instanceAdminOverviewContract = c.router(
  {
    /**
     * GET /api/auth/admin/bgst/users
     * Minimal user list for this deployment (admin), optionally filtered by `q`.
     */
    listUsers: {
      method: 'GET',
      path: '/api/auth/admin/bgst/users',
      query: instanceAdminUsersQuerySchema,
      responses: {
        200: instanceAdminUsersResponseSchema,
        401: instanceAdminOverviewErrorResponseSchema,
        403: instanceAdminOverviewErrorResponseSchema,
        500: instanceAdminOverviewErrorResponseSchema,
      },
      summary: 'List users on this deployment (admin, data-minimal)',
    },

    /**
     * PATCH /api/auth/admin/bgst/users/:userId/panda
     * Unlock or lock the „Panda" model lane for one account.
     */
    setUserPanda: {
      method: 'PATCH',
      path: '/api/auth/admin/bgst/users/:userId/panda',
      pathParams: z.object({ userId: z.string().guid() }),
      body: instanceAdminSetPandaBodySchema,
      responses: {
        200: instanceAdminUserResponseSchema,
        401: instanceAdminOverviewErrorResponseSchema,
        403: instanceAdminOverviewErrorResponseSchema,
        404: instanceAdminOverviewErrorResponseSchema,
        500: instanceAdminOverviewErrorResponseSchema,
      },
      summary: 'Unlock or lock the Panda model lane for one account (admin)',
    },

    /**
     * PATCH /api/auth/admin/bgst/users/:userId/admin
     * Grant or revoke instance-admin rights. Revoking one's own is refused (409).
     */
    setUserAdmin: {
      method: 'PATCH',
      path: '/api/auth/admin/bgst/users/:userId/admin',
      pathParams: z.object({ userId: z.string().guid() }),
      body: instanceAdminSetAdminBodySchema,
      responses: {
        200: instanceAdminUserResponseSchema,
        401: instanceAdminOverviewErrorResponseSchema,
        403: instanceAdminOverviewErrorResponseSchema,
        404: instanceAdminOverviewErrorResponseSchema,
        409: instanceAdminOverviewErrorResponseSchema,
        500: instanceAdminOverviewErrorResponseSchema,
      },
      summary: 'Grant or revoke instance-admin rights for one account (admin)',
    },

    /**
     * GET /api/auth/admin/bgst/roles
     * Read-only overview of self-reported Ebene/Bundesland/Rolle.
     */
    listRoles: {
      method: 'GET',
      path: '/api/auth/admin/bgst/roles',
      responses: {
        200: instanceAdminRolesResponseSchema,
        401: instanceAdminOverviewErrorResponseSchema,
        403: instanceAdminOverviewErrorResponseSchema,
        500: instanceAdminOverviewErrorResponseSchema,
      },
      summary: 'Read-only overview of self-reported roles on this deployment (admin)',
    },

    /**
     * GET /api/auth/admin/bgst/app-bundles
     * Which mobile app bundles (store build or OTA update) were in use over the
     * last 30 days, with distinct accounts per bundle.
     */
    listAppBundles: {
      method: 'GET',
      path: '/api/auth/admin/bgst/app-bundles',
      responses: {
        200: instanceAdminAppBundlesResponseSchema,
        401: instanceAdminOverviewErrorResponseSchema,
        403: instanceAdminOverviewErrorResponseSchema,
        500: instanceAdminOverviewErrorResponseSchema,
      },
      summary: 'Mobile app bundles in use and their reach (admin)',
    },
  },
  { pathPrefix: '' }
);
