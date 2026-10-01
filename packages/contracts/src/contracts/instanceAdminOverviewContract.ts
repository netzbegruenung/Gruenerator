/**
 * ts-rest contract for the Bundesgeschäftsstelle-instance admin overview.
 * Read-only except for the „Panda" unlock, `is_admin`-gated (requireInstanceAdmin, enforced per-handler
 * like adminVorlagenContract/skillVisibilityContract). Rezepte-Sichtbarkeit
 * is intentionally NOT duplicated here — the existing skillVisibilityContract
 * already runs on this deployment; the BGST admin UI just links to it.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  instanceAdminSetPandaBodySchema,
  instanceAdminSetPandaResponseSchema,
  instanceAdminUsersResponseSchema,
  instanceAdminRolesResponseSchema,
  instanceAdminOverviewErrorResponseSchema,
} from '../schemas/instanceAdminOverview.js';

const c = initContract();

export const instanceAdminOverviewContract = c.router(
  {
    /**
     * GET /api/auth/admin/bgst/users
     * Minimal user list for this deployment (admin).
     */
    listUsers: {
      method: 'GET',
      path: '/api/auth/admin/bgst/users',
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
      pathParams: z.object({ userId: z.string().uuid() }),
      body: instanceAdminSetPandaBodySchema,
      responses: {
        200: instanceAdminSetPandaResponseSchema,
        401: instanceAdminOverviewErrorResponseSchema,
        403: instanceAdminOverviewErrorResponseSchema,
        404: instanceAdminOverviewErrorResponseSchema,
        500: instanceAdminOverviewErrorResponseSchema,
      },
      summary: 'Unlock or lock the Panda model lane for one account (admin)',
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
  },
  { pathPrefix: '' }
);
