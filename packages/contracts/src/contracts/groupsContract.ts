/**
 * ts-rest contract for public-group discovery + admin-moderated join requests.
 *
 * Additive to the legacy raw group routes (apps/api/routes/auth/groups/*).
 * These six endpoints are the new public-groups feature; the existing group
 * CRUD / membership / content-sharing / avatar routes remain on the legacy
 * router. All routes require auth — `requireAuth` is applied at the
 * `/api/auth/groups` prefix in routes.ts.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  discoverGroupsResponseSchema,
  groupErrorResponseSchema,
  groupSuccessResponseSchema,
  groupVisibilityResponseSchema,
  joinRequestsResponseSchema,
  requestToJoinResponseSchema,
  setGroupVisibilityBodySchema,
} from '../schemas/groups.js';

const c = initContract();

export const groupsContract = c.router({
  /**
   * GET /api/auth/groups/discover
   * Public groups the caller can see (audience-filtered by locale), excluding
   * groups they already belong to. Each is annotated with the caller's
   * current request_status.
   */
  discoverPublicGroups: {
    method: 'GET',
    path: '/api/auth/groups/discover',
    responses: {
      200: discoverGroupsResponseSchema,
      401: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'List discoverable public groups for the authenticated user',
  },

  /**
   * PUT /api/auth/groups/:groupId/visibility
   * Admin toggles discoverability + audience.
   */
  setVisibility: {
    method: 'PUT',
    path: '/api/auth/groups/:groupId/visibility',
    pathParams: z.object({ groupId: z.string() }),
    body: setGroupVisibilityBodySchema,
    responses: {
      200: groupVisibilityResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      404: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Set group public visibility and audience (admin)',
  },

  /**
   * POST /api/auth/groups/:groupId/join-requests
   * A user requests to join a public group. Idempotent on an existing pending
   * request (409).
   */
  requestToJoin: {
    method: 'POST',
    path: '/api/auth/groups/:groupId/join-requests',
    pathParams: z.object({ groupId: z.string() }),
    body: c.noBody(),
    responses: {
      201: requestToJoinResponseSchema,
      400: groupErrorResponseSchema,
      401: groupErrorResponseSchema,
      404: groupErrorResponseSchema,
      409: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Request to join a public group',
  },

  /**
   * GET /api/auth/groups/:groupId/join-requests
   * Admin lists pending join requests for a group.
   */
  listJoinRequests: {
    method: 'GET',
    path: '/api/auth/groups/:groupId/join-requests',
    pathParams: z.object({ groupId: z.string() }),
    responses: {
      200: joinRequestsResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'List pending join requests for a group (admin)',
  },

  /**
   * POST /api/auth/groups/:groupId/join-requests/:requestId/approve
   * Admin approves a pending request → creates membership.
   */
  approveJoinRequest: {
    method: 'POST',
    path: '/api/auth/groups/:groupId/join-requests/:requestId/approve',
    pathParams: z.object({ groupId: z.string(), requestId: z.string() }),
    body: c.noBody(),
    responses: {
      200: groupSuccessResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      404: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Approve a join request (admin)',
  },

  /**
   * POST /api/auth/groups/:groupId/join-requests/:requestId/deny
   * Admin denies a pending request.
   */
  denyJoinRequest: {
    method: 'POST',
    path: '/api/auth/groups/:groupId/join-requests/:requestId/deny',
    pathParams: z.object({ groupId: z.string(), requestId: z.string() }),
    body: c.noBody(),
    responses: {
      200: groupSuccessResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      404: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Deny a join request (admin)',
  },
});
