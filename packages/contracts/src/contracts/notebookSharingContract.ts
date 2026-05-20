/**
 * ts-rest contract for notebook sharing endpoints.
 *
 * Why a separate contract from notebookCollectionsContract:
 *   - keeps the CRUD contract stable and tight,
 *   - lets the docs share UI's reusable GroupShareSection point at this contract
 *     with a different urlPrefix without dragging notebook CRUD types along.
 *
 * Path shape matches the CRUD contract: `/api/auth/notebook-collections/:id/...`.
 *
 * `GET /api/auth/groups/me` is the neutral "my groups" endpoint that both the
 * docs and notebook share UIs can call (replacing `/api/docs/groups/me` over
 * time).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { notebookErrorResponseSchema } from '../schemas/notebook.js';
import {
  notebookAddGroupShareBodySchema,
  notebookAudienceBodySchema,
  notebookEditPolicyBodySchema,
  notebookGroupSharesResponseSchema,
  notebookIsPublicBodySchema,
  notebookShareErrorResponseSchema,
  notebookShareModeBodySchema,
  notebookShareSettingsSchema,
  notebookSimpleSuccessSchema,
  notebookUserGroupsResponseSchema,
} from '../schemas/notebookSharing.js';

const c = initContract();

export const notebookSharingContract = c.router(
  {
    /**
     * GET /api/auth/groups/me
     * List the groups the authenticated user belongs to. Used by share dialogs
     * (docs + notebooks) to populate the "add a group" dropdown.
     */
    listMyGroups: {
      method: 'GET',
      path: '/api/auth/groups/me',
      responses: {
        200: notebookUserGroupsResponseSchema,
        401: notebookShareErrorResponseSchema,
        500: notebookShareErrorResponseSchema,
      },
      summary: 'List groups the authenticated user belongs to',
    },

    /**
     * GET /api/auth/notebook-collections/:id/share
     * Read current share settings (share_mode + edit_policy).
     */
    getShareSettings: {
      method: 'GET',
      path: '/api/auth/notebook-collections/:id/share',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: notebookShareSettingsSchema,
        401: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Get share settings for a notebook collection',
    },

    /**
     * PUT /api/auth/notebook-collections/:id/share/mode
     * Update share_mode (private | groups | authenticated). Owner only.
     */
    setShareMode: {
      method: 'PUT',
      path: '/api/auth/notebook-collections/:id/share/mode',
      pathParams: z.object({ id: z.string() }),
      body: notebookShareModeBodySchema,
      responses: {
        200: notebookSimpleSuccessSchema,
        401: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Set notebook share mode',
    },

    /**
     * PUT /api/auth/notebook-collections/:id/share/edit-policy
     * Update edit_policy (owner_only | group_admins | all_members). Owner only.
     */
    setEditPolicy: {
      method: 'PUT',
      path: '/api/auth/notebook-collections/:id/share/edit-policy',
      pathParams: z.object({ id: z.string() }),
      body: notebookEditPolicyBodySchema,
      responses: {
        200: notebookSimpleSuccessSchema,
        401: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Set notebook edit policy',
    },

    /**
     * PUT /api/auth/notebook-collections/:id/share/audience
     * Update locale audience (de-DE | de-AT | all). Owner only.
     * Only filters the `share_mode='authenticated'` listing — owners and
     * explicit group-share viewers always see the notebook regardless of
     * audience.
     */
    setAudience: {
      method: 'PUT',
      path: '/api/auth/notebook-collections/:id/share/audience',
      pathParams: z.object({ id: z.string() }),
      body: notebookAudienceBodySchema,
      responses: {
        200: notebookSimpleSuccessSchema,
        401: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Set notebook locale audience',
    },

    /**
     * PUT /api/auth/notebook-collections/:id/share/is-public
     * Toggle Von-der-Basis discovery on top of share_mode='authenticated'.
     * Owner only. is_public=true requires public_ownership and a share_mode
     * that grants read access to authenticated users (enforced server-side).
     */
    setIsPublic: {
      method: 'PUT',
      path: '/api/auth/notebook-collections/:id/share/is-public',
      pathParams: z.object({ id: z.string() }),
      body: notebookIsPublicBodySchema,
      responses: {
        200: notebookSimpleSuccessSchema,
        400: notebookErrorResponseSchema,
        401: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Toggle Von-der-Basis discovery for a notebook',
    },

    /**
     * GET /api/auth/notebook-collections/:id/groups
     * List the groups this notebook is shared with. Owner only.
     */
    listGroupShares: {
      method: 'GET',
      path: '/api/auth/notebook-collections/:id/groups',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: notebookGroupSharesResponseSchema,
        401: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'List groups a notebook is shared with',
    },

    /**
     * POST /api/auth/notebook-collections/:id/groups
     * Share a notebook with a group. Owner only; caller must be member of
     * the group.
     */
    addGroupShare: {
      method: 'POST',
      path: '/api/auth/notebook-collections/:id/groups',
      pathParams: z.object({ id: z.string() }),
      body: notebookAddGroupShareBodySchema,
      responses: {
        201: notebookSimpleSuccessSchema,
        401: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        409: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Share a notebook with a group',
    },

    /**
     * DELETE /api/auth/notebook-collections/:id/groups/:groupId
     * Stop sharing a notebook with a group. Owner only.
     */
    deleteGroupShare: {
      method: 'DELETE',
      path: '/api/auth/notebook-collections/:id/groups/:groupId',
      pathParams: z.object({ id: z.string(), groupId: z.string() }),
      body: c.noBody(),
      responses: {
        200: notebookSimpleSuccessSchema,
        401: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Unshare a notebook from a group',
    },
  },
  { pathPrefix: '' }
);
