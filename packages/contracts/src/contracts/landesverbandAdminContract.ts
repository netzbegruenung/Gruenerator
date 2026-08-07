/**
 * ts-rest contract for the Landesverband-Admin self-service surface. Every
 * route except `mine` carries `:landesverbandId` in its path and is gated by
 * `requireLandesverbandAdmin` (a global instance-admin passes too) — the
 * handler MUST re-verify against the session on every call, never trust the
 * path segment alone. `mine` is the one exception: it answers "which LV(s)
 * do I administer" for the frontend's `RequireAdmin`/`LandesverbandSwitcher`,
 * gated only by authentication.
 */
import { initContract } from '@ts-rest/core';

import {
  landesverbandAdminErrorResponseSchema,
  landesverbandAdminSuccessResponseSchema,
  myLandesverbandScopesResponseSchema,
  landesverbandDetailResponseSchema,
  updateLandesverbandGreetingBodySchema,
  landesverbandSkillsResponseSchema,
  setLandesverbandSkillHiddenBodySchema,
  landesverbandUsersResponseSchema,
} from '../schemas/landesverbandAdmin.js';

const c = initContract();

export const landesverbandAdminContract = c.router(
  {
    /** GET /api/auth/admin/landesverband/mine */
    mine: {
      method: 'GET',
      path: '/api/auth/admin/landesverband/mine',
      responses: {
        200: myLandesverbandScopesResponseSchema,
        401: landesverbandAdminErrorResponseSchema,
        500: landesverbandAdminErrorResponseSchema,
      },
      summary: 'Which Landesverband(e) the current user administers',
    },

    /** GET /api/auth/admin/landesverband/:landesverbandId */
    get: {
      method: 'GET',
      path: '/api/auth/admin/landesverband/:landesverbandId',
      responses: {
        200: landesverbandDetailResponseSchema,
        401: landesverbandAdminErrorResponseSchema,
        403: landesverbandAdminErrorResponseSchema,
        404: landesverbandAdminErrorResponseSchema,
        500: landesverbandAdminErrorResponseSchema,
      },
      summary: 'Landesverband master data + member count (LV-admin)',
    },

    /** PATCH /api/auth/admin/landesverband/:landesverbandId/greeting */
    updateGreeting: {
      method: 'PATCH',
      path: '/api/auth/admin/landesverband/:landesverbandId/greeting',
      body: updateLandesverbandGreetingBodySchema,
      responses: {
        200: landesverbandAdminSuccessResponseSchema,
        401: landesverbandAdminErrorResponseSchema,
        403: landesverbandAdminErrorResponseSchema,
        500: landesverbandAdminErrorResponseSchema,
      },
      summary: 'Update the Landesverband greeting text (LV-admin)',
    },

    /** GET /api/auth/admin/landesverband/:landesverbandId/skills */
    listSkills: {
      method: 'GET',
      path: '/api/auth/admin/landesverband/:landesverbandId/skills',
      responses: {
        200: landesverbandSkillsResponseSchema,
        401: landesverbandAdminErrorResponseSchema,
        403: landesverbandAdminErrorResponseSchema,
        500: landesverbandAdminErrorResponseSchema,
      },
      summary: 'Rezepte with instance-wide and LV-scoped visibility (LV-admin)',
    },

    /** PATCH /api/auth/admin/landesverband/:landesverbandId/skills/:mention */
    setSkillHidden: {
      method: 'PATCH',
      path: '/api/auth/admin/landesverband/:landesverbandId/skills/:mention',
      body: setLandesverbandSkillHiddenBodySchema,
      responses: {
        200: landesverbandAdminSuccessResponseSchema,
        401: landesverbandAdminErrorResponseSchema,
        403: landesverbandAdminErrorResponseSchema,
        500: landesverbandAdminErrorResponseSchema,
      },
      summary: 'Hide/unhide a Rezept for this Landesverband only (LV-admin)',
    },

    /** GET /api/auth/admin/landesverband/:landesverbandId/users */
    listUsers: {
      method: 'GET',
      path: '/api/auth/admin/landesverband/:landesverbandId/users',
      responses: {
        200: landesverbandUsersResponseSchema,
        401: landesverbandAdminErrorResponseSchema,
        403: landesverbandAdminErrorResponseSchema,
        500: landesverbandAdminErrorResponseSchema,
      },
      summary: 'Minimal member list of this Landesverband (LV-admin)',
    },
  },
  { pathPrefix: '' }
);
