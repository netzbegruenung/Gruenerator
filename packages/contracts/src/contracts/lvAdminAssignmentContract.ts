/**
 * ts-rest contract for Hauptgrünerator-Super-Admin management of the
 * Landesverband tenant model: LV master data (name, email-domain
 * verification signal), and who administers which LV. Every route is gated
 * by `requireInstanceAdmin` only — this is deliberately NOT LV-scoped, since
 * granting/revoking LV-admin rights must never depend on already being that
 * LV's admin. `searchUsers` backs the assignment picker.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  landesverbandListResponseSchema,
  updateLandesverbandBodySchema,
  landesverbandSuccessResponseSchema,
  landesverbandErrorResponseSchema,
  landesverbandAdminListResponseSchema,
  assignLandesverbandAdminBodySchema,
} from '../schemas/landesverbaende.js';
import {
  adminUserSearchResponseSchema,
  adminUserSearchErrorResponseSchema,
} from '../schemas/lvAdminAssignment.js';

const c = initContract();

export const lvAdminAssignmentContract = c.router(
  {
    /** GET /api/auth/admin/landesverbaende */
    list: {
      method: 'GET',
      path: '/api/auth/admin/landesverbaende',
      responses: {
        200: landesverbandListResponseSchema,
        401: landesverbandErrorResponseSchema,
        403: landesverbandErrorResponseSchema,
        500: landesverbandErrorResponseSchema,
      },
      summary: 'List all Landesverbände (super-admin)',
    },

    /** PATCH /api/auth/admin/landesverbaende/:landesverbandId */
    update: {
      method: 'PATCH',
      path: '/api/auth/admin/landesverbaende/:landesverbandId',
      body: updateLandesverbandBodySchema,
      responses: {
        200: landesverbandSuccessResponseSchema,
        401: landesverbandErrorResponseSchema,
        403: landesverbandErrorResponseSchema,
        404: landesverbandErrorResponseSchema,
        409: landesverbandErrorResponseSchema,
        500: landesverbandErrorResponseSchema,
      },
      summary: 'Update Landesverband name / email-domain verification signal (super-admin)',
    },

    /** GET /api/auth/admin/landesverbaende/:landesverbandId/admins */
    listAdmins: {
      method: 'GET',
      path: '/api/auth/admin/landesverbaende/:landesverbandId/admins',
      responses: {
        200: landesverbandAdminListResponseSchema,
        401: landesverbandErrorResponseSchema,
        403: landesverbandErrorResponseSchema,
        500: landesverbandErrorResponseSchema,
      },
      summary: 'List admins of one Landesverband (super-admin)',
    },

    /** POST /api/auth/admin/landesverbaende/:landesverbandId/admins */
    assignAdmin: {
      method: 'POST',
      path: '/api/auth/admin/landesverbaende/:landesverbandId/admins',
      body: assignLandesverbandAdminBodySchema,
      responses: {
        200: landesverbandSuccessResponseSchema,
        401: landesverbandErrorResponseSchema,
        403: landesverbandErrorResponseSchema,
        404: landesverbandErrorResponseSchema,
        500: landesverbandErrorResponseSchema,
      },
      summary: 'Grant Landesverband-Admin rights to a user by email (super-admin)',
    },

    /** DELETE /api/auth/admin/landesverbaende/:landesverbandId/admins/:userId */
    revokeAdmin: {
      method: 'DELETE',
      path: '/api/auth/admin/landesverbaende/:landesverbandId/admins/:userId',
      body: z.object({}),
      responses: {
        200: landesverbandSuccessResponseSchema,
        401: landesverbandErrorResponseSchema,
        403: landesverbandErrorResponseSchema,
        500: landesverbandErrorResponseSchema,
      },
      summary: 'Revoke Landesverband-Admin rights from a user (super-admin)',
    },

    /** GET /api/auth/admin/users?search=&cursor= */
    searchUsers: {
      method: 'GET',
      path: '/api/auth/admin/users',
      query: z.object({
        search: z.string().optional(),
        cursor: z.string().optional(),
      }),
      responses: {
        200: adminUserSearchResponseSchema,
        401: adminUserSearchErrorResponseSchema,
        403: adminUserSearchErrorResponseSchema,
        500: adminUserSearchErrorResponseSchema,
      },
      summary: 'Paginated, searchable minimal user list for the assignment picker (super-admin)',
    },
  },
  { pathPrefix: '' }
);
