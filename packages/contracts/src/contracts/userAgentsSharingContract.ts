/**
 * ts-rest contract for user-agent (Agentura) sharing endpoints.
 *
 * Separate from userAgentsContract so the CRUD contract stays tight. Paths sit
 * under the CRUD prefix: `/api/user-agents/:identifier/...`.
 *
 * `listMyGroups` is intentionally NOT redefined here — the share UI reuses the
 * neutral `GET /api/auth/groups/me` from notebookSharingContract.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  publicUserAgentsResponseSchema,
  userAgentAddGroupShareBodySchema,
  userAgentAudienceBodySchema,
  userAgentGroupSharesResponseSchema,
  userAgentIsPublicBodySchema,
  userAgentShareErrorResponseSchema,
  userAgentShareModeBodySchema,
  userAgentShareSettingsSchema,
  userAgentShareSimpleSuccessSchema,
} from '../schemas/userAgentsSharing.js';

const c = initContract();

export const userAgentsSharingContract = c.router(
  {
    /**
     * GET /api/user-agents/public
     * Public Agentura discovery feed: agents listed publicly (is_public=true
     * atop share_mode='authenticated'), locale-filtered server-side.
     * Declared before the `:identifier` routes so `public` is not swallowed.
     */
    listPublic: {
      method: 'GET',
      path: '/api/user-agents/public',
      responses: {
        200: publicUserAgentsResponseSchema,
        401: userAgentShareErrorResponseSchema,
        500: userAgentShareErrorResponseSchema,
      },
      summary: 'List publicly-listed agents for the Agentura directory',
    },

    /** GET /api/user-agents/:identifier/share — current share settings. Owner only. */
    getShareSettings: {
      method: 'GET',
      path: '/api/user-agents/:identifier/share',
      pathParams: z.object({ identifier: z.string() }),
      responses: {
        200: userAgentShareSettingsSchema,
        401: userAgentShareErrorResponseSchema,
        403: userAgentShareErrorResponseSchema,
        404: userAgentShareErrorResponseSchema,
        500: userAgentShareErrorResponseSchema,
      },
      summary: 'Get share settings for an agent',
    },

    /** PUT /api/user-agents/:identifier/share/mode — set visibility. Owner only. */
    setShareMode: {
      method: 'PUT',
      path: '/api/user-agents/:identifier/share/mode',
      pathParams: z.object({ identifier: z.string() }),
      body: userAgentShareModeBodySchema,
      responses: {
        200: userAgentShareSimpleSuccessSchema,
        401: userAgentShareErrorResponseSchema,
        403: userAgentShareErrorResponseSchema,
        404: userAgentShareErrorResponseSchema,
        500: userAgentShareErrorResponseSchema,
      },
      summary: 'Set agent share mode',
    },

    /** PUT /api/user-agents/:identifier/share/audience — set locale audience. Owner only. */
    setAudience: {
      method: 'PUT',
      path: '/api/user-agents/:identifier/share/audience',
      pathParams: z.object({ identifier: z.string() }),
      body: userAgentAudienceBodySchema,
      responses: {
        200: userAgentShareSimpleSuccessSchema,
        401: userAgentShareErrorResponseSchema,
        403: userAgentShareErrorResponseSchema,
        404: userAgentShareErrorResponseSchema,
        500: userAgentShareErrorResponseSchema,
      },
      summary: 'Set agent locale audience',
    },

    /**
     * PUT /api/user-agents/:identifier/share/is-public
     * Toggle Agentura discovery atop share_mode='authenticated'. Owner only.
     * is_public=true requires public_ownership and share_mode='authenticated'
     * (enforced server-side).
     */
    setIsPublic: {
      method: 'PUT',
      path: '/api/user-agents/:identifier/share/is-public',
      pathParams: z.object({ identifier: z.string() }),
      body: userAgentIsPublicBodySchema,
      responses: {
        200: userAgentShareSimpleSuccessSchema,
        400: userAgentShareErrorResponseSchema,
        401: userAgentShareErrorResponseSchema,
        403: userAgentShareErrorResponseSchema,
        404: userAgentShareErrorResponseSchema,
        500: userAgentShareErrorResponseSchema,
      },
      summary: 'Toggle Agentura discovery for an agent',
    },

    /** GET /api/user-agents/:identifier/groups — groups this agent is shared with. Owner only. */
    listGroupShares: {
      method: 'GET',
      path: '/api/user-agents/:identifier/groups',
      pathParams: z.object({ identifier: z.string() }),
      responses: {
        200: userAgentGroupSharesResponseSchema,
        401: userAgentShareErrorResponseSchema,
        403: userAgentShareErrorResponseSchema,
        404: userAgentShareErrorResponseSchema,
        500: userAgentShareErrorResponseSchema,
      },
      summary: 'List groups an agent is shared with',
    },

    /** POST /api/user-agents/:identifier/groups — share with a group. Owner + member only. */
    addGroupShare: {
      method: 'POST',
      path: '/api/user-agents/:identifier/groups',
      pathParams: z.object({ identifier: z.string() }),
      body: userAgentAddGroupShareBodySchema,
      responses: {
        201: userAgentShareSimpleSuccessSchema,
        401: userAgentShareErrorResponseSchema,
        403: userAgentShareErrorResponseSchema,
        404: userAgentShareErrorResponseSchema,
        409: userAgentShareErrorResponseSchema,
        500: userAgentShareErrorResponseSchema,
      },
      summary: 'Share an agent with a group',
    },

    /** DELETE /api/user-agents/:identifier/groups/:groupId — unshare from a group. Owner only. */
    deleteGroupShare: {
      method: 'DELETE',
      path: '/api/user-agents/:identifier/groups/:groupId',
      pathParams: z.object({ identifier: z.string(), groupId: z.string() }),
      body: c.noBody(),
      responses: {
        200: userAgentShareSimpleSuccessSchema,
        401: userAgentShareErrorResponseSchema,
        403: userAgentShareErrorResponseSchema,
        404: userAgentShareErrorResponseSchema,
        500: userAgentShareErrorResponseSchema,
      },
      summary: 'Unshare an agent from a group',
    },
  },
  { pathPrefix: '' }
);
