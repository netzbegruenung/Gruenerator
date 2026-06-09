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
  contentPermissionsBodySchema,
  createGroupBodySchema,
  deleteContentBodySchema,
  discoverGroupsResponseSchema,
  groupContentResponseSchema,
  groupCreateResponseSchema,
  groupDetailsResponseSchema,
  groupErrorResponseSchema,
  groupLinkBodySchema,
  groupLinkResponseSchema,
  groupMembersResponseSchema,
  groupMuteResponseSchema,
  groupOkResponseSchema,
  groupResolveResponseSchema,
  groupSuccessResponseSchema,
  groupVisibilityResponseSchema,
  groupVorlagenResponseSchema,
  joinByTokenBodySchema,
  joinGroupResponseSchema,
  joinRequestsResponseSchema,
  listUserGroupsResponseSchema,
  memberRoleBodySchema,
  requestToJoinResponseSchema,
  setGroupMuteBodySchema,
  setGroupVisibilityBodySchema,
  shareContentBodySchema,
  unshareContentBodySchema,
  updateGroupInfoBodySchema,
  updateGroupNameBodySchema,
  verifyTokenResponseSchema,
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

  // ── Core group CRUD / membership / links (migrated from legacy raw routes) ──

  listUserGroups: {
    method: 'GET',
    path: '/api/auth/groups',
    responses: {
      200: listUserGroupsResponseSchema,
      401: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'List the groups the authenticated user belongs to',
  },

  /**
   * GET /api/auth/groups/resolve/:slugOrId
   * Resolve a Notion-style slug (`<name>-<suffix>`) or raw UUID to the group's
   * canonical id. Membership is enforced downstream by /details, so this only
   * needs auth. Distinct path segment from /:groupId so there's no collision.
   */
  resolveGroup: {
    method: 'GET',
    path: '/api/auth/groups/resolve/:slugOrId',
    pathParams: z.object({ slugOrId: z.string() }),
    responses: {
      200: groupResolveResponseSchema,
      401: groupErrorResponseSchema,
      404: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Resolve a group slug or UUID to its canonical id',
  },

  createGroup: {
    method: 'POST',
    path: '/api/auth/groups',
    body: createGroupBodySchema,
    responses: {
      200: groupCreateResponseSchema,
      401: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Create a new group',
  },

  deleteGroup: {
    method: 'DELETE',
    path: '/api/auth/groups/:groupId',
    pathParams: z.object({ groupId: z.string() }),
    responses: {
      200: groupSuccessResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      404: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Delete a group (creator/admin)',
  },

  getDetails: {
    method: 'GET',
    path: '/api/auth/groups/:groupId/details',
    pathParams: z.object({ groupId: z.string() }),
    responses: {
      200: groupDetailsResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Get group details + the caller membership',
  },

  updateInfo: {
    method: 'PUT',
    path: '/api/auth/groups/:groupId/info',
    pathParams: z.object({ groupId: z.string() }),
    body: updateGroupInfoBodySchema,
    responses: {
      200: groupSuccessResponseSchema,
      400: groupErrorResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Update group name/description/settings (admin)',
  },

  updateName: {
    method: 'PUT',
    path: '/api/auth/groups/:groupId/name',
    pathParams: z.object({ groupId: z.string() }),
    body: updateGroupNameBodySchema,
    responses: {
      200: groupSuccessResponseSchema,
      400: groupErrorResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Update group name (legacy)',
  },

  verifyToken: {
    method: 'GET',
    path: '/api/auth/groups/verify-token/:joinToken',
    pathParams: z.object({ joinToken: z.string() }),
    responses: {
      200: verifyTokenResponseSchema,
      400: groupErrorResponseSchema,
      401: groupErrorResponseSchema,
      404: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Verify a join token',
  },

  joinByToken: {
    method: 'POST',
    path: '/api/auth/groups/join',
    body: joinByTokenBodySchema,
    responses: {
      200: joinGroupResponseSchema,
      401: groupErrorResponseSchema,
      404: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Join a group via token',
  },

  leaveGroup: {
    method: 'DELETE',
    path: '/api/auth/groups/:groupId/members/self',
    pathParams: z.object({ groupId: z.string() }),
    responses: {
      200: groupSuccessResponseSchema,
      400: groupErrorResponseSchema,
      401: groupErrorResponseSchema,
      404: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Leave a group (non-creator)',
  },

  /**
   * PUT /api/auth/groups/:groupId/mute
   * The caller mutes/unmutes their own email + push notifications for this
   * group. In-app notifications are unaffected. Operates on the caller's own
   * membership — no admin rights required.
   */
  setGroupMute: {
    method: 'PUT',
    path: '/api/auth/groups/:groupId/mute',
    pathParams: z.object({ groupId: z.string() }),
    body: setGroupMuteBodySchema,
    responses: {
      200: groupMuteResponseSchema,
      401: groupErrorResponseSchema,
      404: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Mute or unmute the caller notifications for a group',
  },

  listMembers: {
    method: 'GET',
    path: '/api/auth/groups/:groupId/members',
    pathParams: z.object({ groupId: z.string() }),
    responses: {
      200: groupMembersResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'List group members',
  },

  updateMemberRole: {
    method: 'PUT',
    path: '/api/auth/groups/:groupId/members/:memberId/role',
    pathParams: z.object({ groupId: z.string(), memberId: z.string() }),
    body: memberRoleBodySchema,
    responses: {
      200: groupSuccessResponseSchema,
      400: groupErrorResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      404: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Change a member role (admin)',
  },

  addLink: {
    method: 'POST',
    path: '/api/auth/groups/:groupId/links',
    pathParams: z.object({ groupId: z.string() }),
    body: groupLinkBodySchema,
    responses: {
      200: groupLinkResponseSchema,
      400: groupErrorResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Add a group link (admin)',
  },

  updateLink: {
    method: 'PUT',
    path: '/api/auth/groups/:groupId/links/:linkId',
    pathParams: z.object({ groupId: z.string(), linkId: z.string() }),
    body: groupLinkBodySchema,
    responses: {
      200: groupLinkResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      404: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Update a group link (admin)',
  },

  deleteLink: {
    method: 'DELETE',
    path: '/api/auth/groups/:groupId/links/:linkId',
    pathParams: z.object({ groupId: z.string(), linkId: z.string() }),
    responses: {
      200: groupOkResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Delete a group link (admin)',
  },

  // ── Content sharing (migrated from legacy groupContent.ts) ──────────────────

  shareContent: {
    method: 'POST',
    path: '/api/auth/groups/:groupId/share',
    pathParams: z.object({ groupId: z.string() }),
    body: shareContentBodySchema,
    responses: {
      200: groupSuccessResponseSchema,
      400: groupErrorResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      404: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Share content with a group',
  },

  unshareContent: {
    method: 'DELETE',
    path: '/api/auth/groups/:groupId/share',
    pathParams: z.object({ groupId: z.string() }),
    body: unshareContentBodySchema,
    responses: {
      200: groupSuccessResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      404: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Unshare content shared by the caller',
  },

  listGroupContent: {
    method: 'GET',
    path: '/api/auth/groups/:groupId/content',
    pathParams: z.object({ groupId: z.string() }),
    responses: {
      200: groupContentResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'List all content shared with a group',
  },

  updateContentPermissions: {
    method: 'PUT',
    path: '/api/auth/groups/:groupId/content/:contentId/permissions',
    pathParams: z.object({ groupId: z.string(), contentId: z.string() }),
    body: contentPermissionsBodySchema,
    responses: {
      200: groupSuccessResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      404: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Update permissions on shared content (admin or sharer)',
  },

  removeGroupContent: {
    method: 'DELETE',
    path: '/api/auth/groups/:groupId/content/:contentId',
    pathParams: z.object({ groupId: z.string(), contentId: z.string() }),
    body: deleteContentBodySchema,
    responses: {
      200: groupSuccessResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      404: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'Remove content from a group (admin)',
  },

  listGroupVorlagen: {
    method: 'GET',
    path: '/api/auth/groups/:groupId/vorlagen',
    pathParams: z.object({ groupId: z.string() }),
    responses: {
      200: groupVorlagenResponseSchema,
      401: groupErrorResponseSchema,
      403: groupErrorResponseSchema,
      500: groupErrorResponseSchema,
    },
    summary: 'List tag-matched templates for a group',
  },
});
