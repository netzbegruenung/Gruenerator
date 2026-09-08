/**
 * ts-rest contract for chat thread sharing: group shares (Mitarbeiten /
 * Nur lesen), the authenticated link share ("Per Link teilen"), resolving a
 * shared thread for the read-only archive view, and forking a shared thread
 * into an own copy.
 *
 * All paths sit under /api/chat-service/threads, so the requireAuth guard
 * mounted on that prefix in routes.ts covers every endpoint — link viewers
 * must be logged in by design.
 *
 * Supersedes the legacy plain-Express threadSharingController
 * (/:id/groups, /user-groups), which stays mounted on its OLD paths for
 * shipped mobile binaries. These paths are deliberately new (group-shares,
 * sharing/user-groups) so the two surfaces never collide.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  forkThreadResponseSchema,
  resolveSharedThreadResponseSchema,
  shareModeResponseSchema,
  shareWithGroupBodySchema,
  sharingUserGroupsResponseSchema,
  threadGroupSharesResponseSchema,
  updateShareModeBodySchema,
} from '../schemas/chatThreadSharing.js';
import { errorResponseSchema, successResponseSchema } from '../schemas/threads.js';

const c = initContract();

export const chatThreadSharingContract = c.router(
  {
    /**
     * Resolve a shared thread by slug suffix or UUID for the archive view.
     * Declared FIRST: ts-rest registers routes in declaration order, and the
     * static `shared/` segment must be matched before any `/:threadId` route.
     * 404 covers both "gone" and "no access" — existence is never confirmed
     * to callers without access.
     */
    resolveShared: {
      method: 'GET',
      path: '/api/chat-service/threads/shared/resolve/:slugOrId',
      pathParams: z.object({ slugOrId: z.string() }),
      responses: {
        200: resolveSharedThreadResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'Resolve a shared chat thread for the read-only view',
    },
    /** The caller's groups, for the share dialog. */
    listUserGroups: {
      method: 'GET',
      path: '/api/chat-service/threads/sharing/user-groups',
      responses: {
        200: sharingUserGroupsResponseSchema,
        500: errorResponseSchema,
      },
      summary: "List the user's groups for thread sharing",
    },
    /** Current group shares of a thread (owner only). */
    listGroupShares: {
      method: 'GET',
      path: '/api/chat-service/threads/:threadId/group-shares',
      pathParams: z.object({ threadId: z.string() }),
      responses: {
        200: threadGroupSharesResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'List group shares of a thread',
    },
    /**
     * Share a thread with a group, or change an existing share's mode —
     * upsert semantics, so switching Mitarbeiten ↔ Nur lesen is the same call.
     */
    shareWithGroup: {
      method: 'POST',
      path: '/api/chat-service/threads/:threadId/group-shares',
      pathParams: z.object({ threadId: z.string() }),
      body: shareWithGroupBodySchema,
      responses: {
        200: successResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'Share a thread with a group (read-only or read-write)',
    },
    unshareGroup: {
      method: 'DELETE',
      path: '/api/chat-service/threads/:threadId/group-shares/:groupId',
      pathParams: z.object({ threadId: z.string(), groupId: z.string() }),
      responses: {
        200: successResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'Remove a group share',
    },
    /** Enable/disable the authenticated link share (owner only).
     *  Setting 'private' revokes the link — the archive view 404s. */
    updateShareMode: {
      method: 'PUT',
      path: '/api/chat-service/threads/:threadId/share-mode',
      pathParams: z.object({ threadId: z.string() }),
      body: updateShareModeBodySchema,
      responses: {
        200: shareModeResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'Set the link share mode of a thread',
    },
    /**
     * Fork a readable thread into a new thread owned by the caller
     * ("In eigenem Chat fortsetzen"). Copies the transcript server-side —
     * client-side import would not persist (history adapter append is a
     * no-op; persistence lives in the SSE stream handler).
     */
    fork: {
      method: 'POST',
      path: '/api/chat-service/threads/:threadId/fork',
      pathParams: z.object({ threadId: z.string() }),
      body: z.object({}),
      responses: {
        200: forkThreadResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'Copy a shared thread into an own thread',
    },
  },
  { pathPrefix: '' }
);
