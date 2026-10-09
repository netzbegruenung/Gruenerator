/**
 * ts-rest contract for /api/auth/reactions
 *
 * Emoji reactions on group posts, group comments, board comments and Vorlagen.
 * The emoji is a path segment (URL-encoded by ts-rest, decoded by Express).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  reactionEmojiSchema,
  reactionEntityTypeSchema,
  reactionErrorResponseSchema,
  reactionsResponseSchema,
} from '../schemas/entityReactions.js';

const c = initContract();

const reactionPathParams = z.object({
  entityType: reactionEntityTypeSchema,
  entityId: z.string().min(1).max(100),
  emoji: reactionEmojiSchema,
});

// Removing accepts any emoji: backfilled legacy board reactions (e.g. 💡) must stay removable.
const removeReactionPathParams = reactionPathParams.extend({
  emoji: z.string().min(1).max(32),
});

export const entityReactionsContract = c.router(
  {
    /** PUT /api/auth/reactions/:entityType/:entityId/:emoji — idempotent add. */
    addReaction: {
      method: 'PUT',
      path: '/api/auth/reactions/:entityType/:entityId/:emoji',
      pathParams: reactionPathParams,
      body: c.noBody(),
      responses: {
        200: reactionsResponseSchema,
        400: reactionErrorResponseSchema,
        401: reactionErrorResponseSchema,
        403: reactionErrorResponseSchema,
        404: reactionErrorResponseSchema,
        500: reactionErrorResponseSchema,
      },
      summary: 'Add an emoji reaction; returns the updated summaries',
    },

    /** DELETE /api/auth/reactions/:entityType/:entityId/:emoji — idempotent remove. */
    removeReaction: {
      method: 'DELETE',
      path: '/api/auth/reactions/:entityType/:entityId/:emoji',
      pathParams: removeReactionPathParams,
      body: c.noBody(),
      responses: {
        200: reactionsResponseSchema,
        400: reactionErrorResponseSchema,
        401: reactionErrorResponseSchema,
        403: reactionErrorResponseSchema,
        404: reactionErrorResponseSchema,
        500: reactionErrorResponseSchema,
      },
      summary: 'Remove an emoji reaction; returns the updated summaries',
    },
  },
  { pathPrefix: '' }
);
