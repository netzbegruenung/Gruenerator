/**
 * ts-rest contract for the Bundesgeschäftsstelle-instance admin overview.
 * Read-only, `is_admin`-gated (requireInstanceAdmin, enforced per-handler
 * like adminVorlagenContract/skillVisibilityContract). Rezepte-Sichtbarkeit
 * is intentionally NOT duplicated here — the existing skillVisibilityContract
 * already runs on this deployment; the BGST admin UI just links to it.
 */
import { initContract } from '@ts-rest/core';

import {
  bgstUsersResponseSchema,
  bgstRolesResponseSchema,
  bgstOverviewErrorResponseSchema,
} from '../schemas/bgstInstanceOverview.js';

const c = initContract();

export const bgstInstanceOverviewContract = c.router(
  {
    /**
     * GET /api/auth/admin/bgst/users
     * Minimal user list for this deployment (admin).
     */
    listUsers: {
      method: 'GET',
      path: '/api/auth/admin/bgst/users',
      responses: {
        200: bgstUsersResponseSchema,
        401: bgstOverviewErrorResponseSchema,
        403: bgstOverviewErrorResponseSchema,
        500: bgstOverviewErrorResponseSchema,
      },
      summary: 'List users on this deployment (admin, data-minimal)',
    },

    /**
     * GET /api/auth/admin/bgst/roles
     * Read-only overview of self-reported Ebene/Bundesland/Rolle.
     */
    listRoles: {
      method: 'GET',
      path: '/api/auth/admin/bgst/roles',
      responses: {
        200: bgstRolesResponseSchema,
        401: bgstOverviewErrorResponseSchema,
        403: bgstOverviewErrorResponseSchema,
        500: bgstOverviewErrorResponseSchema,
      },
      summary: 'Read-only overview of self-reported roles on this deployment (admin)',
    },
  },
  { pathPrefix: '' }
);
